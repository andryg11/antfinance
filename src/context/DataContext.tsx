import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  runTransaction,
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, testConnection } from '../lib/firebase';
import { Product, Transaction, Expense, BusinessSettings, CartItem, Debt, PsRental, PsSavedTime, AdminFeeTier } from '../types';
import { useAuth } from './AuthContext';

export const calculatePsRentalCost = (unit: PsRental, durationMinutes: number): number => {
  if (durationMinutes <= 0) return 0;
  const hourlyRate = unit.hourlyRate || 5000;
  const halfHourlyRate = unit.halfHourlyRate || 3000;

  if (durationMinutes === 30) return halfHourlyRate;
  if (durationMinutes === 60) return hourlyRate;

  const fullHours = Math.floor(durationMinutes / 60);
  const remainderMinutes = durationMinutes % 60;

  let cost = fullHours * hourlyRate;
  if (remainderMinutes > 0 && remainderMinutes <= 30) {
    cost += halfHourlyRate;
  } else if (remainderMinutes > 30) {
    cost += hourlyRate;
  }
  return cost;
};

interface DataContextType {
  products: Product[];
  transactions: Transaction[];
  expenses: Expense[];
  debts: Debt[];
  psRentals: PsRental[];
  psSavedTimes: PsSavedTime[];
  settings: BusinessSettings;
  isRealtimeConnected: boolean;
  isSyncing: boolean;
  createTransaction: (
    items: CartItem[], 
    paymentMethod: 'Tunai' | 'QRIS' | 'Transfer Bank' | 'Debit' | 'Hutang / Kas Bon', 
    amountPaid: number, 
    customerName?: string, 
    discount?: number,
    notes?: string,
    adminFee?: number,
    customerPhone?: string,
    dueDate?: string
  ) => Promise<Transaction>;
  cancelTransaction: (transactionId: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  adjustStock: (id: string, delta: number, note?: string) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  // Debt helpers
  addDebt: (debt: Omit<Debt, 'id' | 'createdAt' | 'remainingAmount'>) => Promise<void>;
  payDebt: (id: string, amountToPay: number) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  // PS Rental helpers
  startPsRental: (
    id: string, 
    customerName: string, 
    durationMinutes: number, 
    customCost?: number, 
    notes?: string,
    savedTimeIdToConsume?: string
  ) => Promise<void>;
  stopPsRental: (id: string, isPaid: boolean) => Promise<void>;
  addPsPlayTime: (id: string, addMinutes: number, additionalCost?: number, notes?: string) => Promise<void>;
  setPsManualTime: (id: string, newExpectedEndTime: string, newCost?: number, notes?: string) => Promise<void>;
  savePsRemainingTime: (unitId: string, customerName: string, remainingMinutes: number, notes?: string) => Promise<void>;
  usePsSavedTime: (savedTimeId: string, unitId: string) => Promise<void>;
  deletePsSavedTime: (savedTimeId: string) => Promise<void>;
  addPsSavedTimeManual: (customerName: string, remainingMinutes: number, notes?: string, customerPhone?: string) => Promise<void>;
  addPsUnit: (unit: Omit<PsRental, 'id' | 'status' | 'updatedAt'>) => Promise<void>;
  updatePsUnit: (id: string, updates: Partial<PsRental>) => Promise<void>;
  deletePsUnit: (id: string) => Promise<void>;
  // Settings & seed
  updateSettings: (newSettings: Partial<BusinessSettings>) => Promise<void>;
  seedInitialData: () => Promise<void>;
  cleanDuplicateProducts: () => Promise<{ deletedCount: number; remainingCount: number }>;
  resetAllData: () => Promise<void>;
}

export const DEFAULT_ADMIN_TIERS: AdminFeeTier[] = [
  { id: '1', minAmount: 10000, maxAmount: 100000, adminFee: 2000, label: 'Rp 10.000 - Rp 100.000' },
  { id: '2', minAmount: 100001, maxAmount: 250000, adminFee: 3000, label: 'Rp 100.001 - Rp 250.000' },
  { id: '3', minAmount: 250001, maxAmount: 500000, adminFee: 4000, label: 'Rp 250.001 - Rp 500.000' },
  { id: '4', minAmount: 500001, maxAmount: 1000000, adminFee: 5000, label: 'Rp 500.001 - Rp 1.000.000' },
  { id: '5', minAmount: 1000001, maxAmount: 2000000, adminFee: 7500, label: 'Rp 1.000.001 - Rp 2.000.000' },
  { id: '6', minAmount: 2000001, maxAmount: 999999999, adminFee: 10000, label: 'Diatas Rp 2.000.000' },
];

export const DEFAULT_DANA_RANGES = [
  { min: 10000, max: 100000, fee: 2000 },
  { min: 100001, max: 250000, fee: 3000 },
  { min: 250001, max: 500000, fee: 4000 },
  { min: 500001, max: 1000000, fee: 5000 },
  { min: 1000001, max: 2000000, fee: 7500 },
  { min: 2000001, max: 999999999, fee: 10000 },
];

export const DEFAULT_TRANSFER_RANGES = [
  { min: 10000, max: 100000, fee: 2500 },
  { min: 100001, max: 500000, fee: 4000 },
  { min: 500001, max: 1000000, fee: 6000 },
  { min: 1000001, max: 2500000, fee: 8500 },
  { min: 2500001, max: 999999999, fee: 12000 },
];

export const DEFAULT_GOPAY_RANGES = [
  { min: 10000, max: 100000, fee: 2000 },
  { min: 100001, max: 300000, fee: 3000 },
  { min: 300001, max: 1000000, fee: 5000 },
  { min: 1000001, max: 999999999, fee: 8000 },
];

export const DEFAULT_OVO_RANGES = [
  { min: 10000, max: 100000, fee: 2000 },
  { min: 100001, max: 300000, fee: 3000 },
  { min: 300001, max: 1000000, fee: 5000 },
  { min: 1000001, max: 999999999, fee: 8000 },
];

export function getProductAdminRanges(product: Partial<Product>): { min: number; max: number; fee: number }[] {
  if (product?.adminRanges && product.adminRanges.length > 0) {
    return product.adminRanges;
  }
  const name = (product?.name || '').toLowerCase();
  if (name.includes('transfer') || name.includes('bank')) return DEFAULT_TRANSFER_RANGES;
  if (name.includes('dana')) return DEFAULT_DANA_RANGES;
  if (name.includes('gopay')) return DEFAULT_GOPAY_RANGES;
  if (name.includes('ovo')) return DEFAULT_OVO_RANGES;
  return DEFAULT_DANA_RANGES;
}

const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Toko & Rental Berkah',
  tagline: 'Usaha Dagang, BBM Eceran, Pulsa & PPOB',
  address: 'Jl. Merdeka No. 45, Jakarta Pusat',
  phone: '0812-3456-7890',
  receiptFooter: 'Terima Kasih Telah Berbelanja & Bertransaksi! Datang kembali ya!',
  adminFeeTiers: DEFAULT_ADMIN_TIERS,
  cloudinaryCloudName: 'cqwosuvb',
};

const SAMPLE_PRODUCTS: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // PPOB Range: Nama tetap 1 (misal DANA, Transfer Antar Bank, GoPay, OVO), range disimpan di data master
  { 
    name: 'DANA', 
    category: 'PPOB Range', 
    sku: 'PPOB-DANA', 
    price: 100000, 
    cost: 100000, 
    stock: 9999, 
    minStock: 10, 
    unit: 'Trx', 
    masterType: 'ppob_range', 
    ppobProvider: 'DANA',
    adminRanges: DEFAULT_DANA_RANGES 
  },
  { 
    name: 'Transfer Antar Bank', 
    category: 'PPOB Range', 
    sku: 'PPOB-TRF', 
    price: 100000, 
    cost: 100000, 
    stock: 9999, 
    minStock: 10, 
    unit: 'Trx', 
    masterType: 'ppob_range', 
    ppobProvider: 'Bank Transfer',
    adminRanges: DEFAULT_TRANSFER_RANGES 
  },
  { 
    name: 'GoPay', 
    category: 'PPOB Range', 
    sku: 'PPOB-GOPAY', 
    price: 50000, 
    cost: 50000, 
    stock: 9999, 
    minStock: 10, 
    unit: 'Trx', 
    masterType: 'ppob_range', 
    ppobProvider: 'GoPay',
    adminRanges: DEFAULT_GOPAY_RANGES 
  },
  { 
    name: 'OVO', 
    category: 'PPOB Range', 
    sku: 'PPOB-OVO', 
    price: 50000, 
    cost: 50000, 
    stock: 9999, 
    minStock: 10, 
    unit: 'Trx', 
    masterType: 'ppob_range', 
    ppobProvider: 'OVO',
    adminRanges: DEFAULT_OVO_RANGES 
  },
  
  // Pulsa (Masuk ke Barang karena nominal tetap: misal harga 12rb modal 10.250)
  { name: 'Pulsa Telkomsel 10.000', category: 'Pulsa', sku: 'PLS-TSEL10', price: 12000, cost: 10250, stock: 999, minStock: 10, unit: 'Trx', masterType: 'barang' },
  { name: 'Pulsa Telkomsel 20.000', category: 'Pulsa', sku: 'PLS-TSEL20', price: 22000, cost: 20100, stock: 999, minStock: 10, unit: 'Trx', masterType: 'barang' },
  { name: 'Pulsa Indosat 10.000', category: 'Pulsa', sku: 'PLS-ISAT10', price: 12000, cost: 10200, stock: 999, minStock: 10, unit: 'Trx', masterType: 'barang' },
  { name: 'Pulsa XL / Axis 10.000', category: 'Pulsa', sku: 'PLS-XL10', price: 12000, cost: 10250, stock: 999, minStock: 10, unit: 'Trx', masterType: 'barang' },
  { name: 'Token Listrik PLN 50.000', category: 'PPOB', sku: 'PLN-50', price: 52500, cost: 50000, stock: 999, minStock: 10, unit: 'Trx', masterType: 'barang' },

  // Voucher Fisik & Kuota Data (dengan Kuota GB & Barcode SKU)
  { name: 'Voucher Telkomsel 10 GB (30 Hari)', category: 'Pulsa', sku: '89910010010', price: 38000, cost: 34500, stock: 50, minStock: 5, unit: 'Pcs', masterType: 'barang' },
  { name: 'Voucher Indosat Freedom 10 GB (30 Hari)', category: 'Pulsa', sku: '89920020010', price: 35000, cost: 31000, stock: 45, minStock: 5, unit: 'Pcs', masterType: 'barang' },
  { name: 'Voucher XL Xtra Combo 15 GB (30 Hari)', category: 'Pulsa', sku: '89930030015', price: 48000, cost: 42500, stock: 30, minStock: 5, unit: 'Pcs', masterType: 'barang' },
  { name: 'Voucher Tri AlwaysOn 3 GB (30 Hari)', category: 'Pulsa', sku: '89940040003', price: 20000, cost: 16500, stock: 40, minStock: 5, unit: 'Pcs', masterType: 'barang' },
  { name: 'Kartu Perdana Axis 24 GB (60 Hari)', category: 'Pulsa', sku: '89950050024', price: 65000, cost: 58000, stock: 25, minStock: 5, unit: 'Pcs', masterType: 'barang' },

  // BBM Products
  { name: 'Pertalite (BBM Eceran)', category: 'BBM', sku: 'BBM-01', price: 12000, cost: 10000, stock: 120, minStock: 25, unit: 'Liter', isFuel: true, masterType: 'barang' },
  { name: 'Pertamax 92 (BBM Eceran)', category: 'BBM', sku: 'BBM-02', price: 14500, cost: 12950, stock: 85, minStock: 20, unit: 'Liter', isFuel: true, masterType: 'barang' },
  { name: 'Bio Solar (BBM Eceran)', category: 'BBM', sku: 'BBM-03', price: 8500, cost: 6800, stock: 60, minStock: 15, unit: 'Liter', isFuel: true, masterType: 'barang' },

  // F&B & Rental snacks
  { name: 'Kopi Susu Gula Aren Dingin', category: 'Minuman', sku: 'DRK-01', price: 15000, cost: 7000, stock: 35, minStock: 10, unit: 'Cup', masterType: 'barang' },
  { name: 'Es Teh Manis Jumbo', category: 'Minuman', sku: 'DRK-02', price: 5000, cost: 1500, stock: 50, minStock: 10, unit: 'Cup', masterType: 'barang' },
  { name: 'Mie Instan Goreng + Telur', category: 'Makanan', sku: 'FOD-01', price: 12000, cost: 6000, stock: 24, minStock: 8, unit: 'Porsi', masterType: 'barang' },
  { name: 'Keripik Singkong Renyah', category: 'Snack', sku: 'SNK-01', price: 8000, cost: 4500, stock: 4, minStock: 6, unit: 'Bks', masterType: 'barang' },
  { name: 'Air Mineral Botol 600ml', category: 'Minuman', sku: 'DRK-03', price: 4000, cost: 2500, stock: 3, minStock: 10, unit: 'Botol', masterType: 'barang' },
];

const SAMPLE_PS_RENTALS: Omit<PsRental, 'id'>[] = [
  { unitName: 'PS 1 (PS4 Slim)', psType: 'PS4', hourlyRate: 5000, halfHourlyRate: 3000, status: 'available' },
  { unitName: 'PS 2 (PS4 Pro)', psType: 'PS4', hourlyRate: 5000, halfHourlyRate: 3000, status: 'available' },
  { unitName: 'PS 3 (PS5 VIP Room)', psType: 'PS5', hourlyRate: 10000, halfHourlyRate: 6000, status: 'available' },
  { unitName: 'PS 4 (PS3 Retro Legend)', psType: 'PS3', hourlyRate: 4000, halfHourlyRate: 2500, status: 'available' },
];

const SAMPLE_DEBTS: Omit<Debt, 'id' | 'createdAt'>[] = [
  {
    customerName: 'Pak RT Bambang',
    customerPhone: '0813-8899-7711',
    amount: 75000,
    paidAmount: 25000,
    remainingAmount: 50000,
    description: 'Beli BBM Pertalite 5 Liter dan Rokok',
    dueDate: '2026-10-25',
    status: 'partial',
  },
  {
    customerName: 'Mas Danu (Bengkel)',
    customerPhone: '0857-1122-3344',
    amount: 45000,
    paidAmount: 0,
    remainingAmount: 45000,
    description: 'BBM Pertamax 3 Liter',
    dueDate: '2026-10-22',
    status: 'unpaid',
  },
];

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [psRentals, setPsRentals] = useState<PsRental[]>([]);
  const [psSavedTimes, setPsSavedTimes] = useState<PsSavedTime[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Check initial connection
  useEffect(() => {
    testConnection().then((connected) => {
      setIsRealtimeConnected(connected);
    });
  }, []);

  // Realtime Products
  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Product[] = [];
        const seenIds = new Set<string>();
        const seenKeys = new Set<string>();
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as Product;
          const key = (item.sku?.trim().toLowerCase()) || (item.name?.trim().toLowerCase() + '___' + (item.category || '').trim().toLowerCase());
          if (!seenIds.has(item.id) && !seenKeys.has(key)) {
            seenIds.add(item.id);
            seenKeys.add(key);
            list.push(item);
          }
        });
        setProducts(list);
        setIsRealtimeConnected(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'products');
        setIsRealtimeConnected(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime Transactions
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Transaction);
        });
        setTransactions(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime Expenses
  useEffect(() => {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Expense);
        });
        setExpenses(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'expenses');
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime Debts (Hutang Pelanggan)
  useEffect(() => {
    const q = query(collection(db, 'debts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Debt[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Debt);
        });
        setDebts(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'debts');
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime PS Rentals
  useEffect(() => {
    const q = query(collection(db, 'ps_rentals'), orderBy('unitName', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: PsRental[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as PsRental);
        });
        setPsRentals(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'ps_rentals');
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime PS Saved Times (Tabungan Sisa Waktu Pelanggan)
  useEffect(() => {
    const q = query(collection(db, 'ps_saved_times'), orderBy('savedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: PsSavedTime[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as PsSavedTime);
        });
        setPsSavedTimes(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'ps_saved_times');
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime Settings
  useEffect(() => {
    const docRef = doc(db, 'settings', 'business_profile');
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snap.data() } as BusinessSettings);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/business_profile');
      }
    );
    return () => unsubscribe();
  }, []);





  const cleanDuplicateProducts = async () => {
    try {
      setIsSyncing(true);
      const snap = await getDocs(collection(db, 'products'));
      const seen = new Map<string, string>();
      const toDelete: string[] = [];
      const docs: Product[] = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() } as Product));
      for (const item of docs) {
        const normName = (item.name || '').trim().toLowerCase();
        const normSku = (item.sku || '').trim().toLowerCase();
        const normCat = (item.category || '').trim().toLowerCase();
        const key = normSku ? normSku : `${normName}___${normCat}`;
        if (seen.has(key)) {
          toDelete.push(item.id);
        } else {
          seen.set(key, item.id);
        }
      }
      for (const id of toDelete) {
        await deleteDoc(doc(db, 'products', id));
      }
      return { deletedCount: toDelete.length, remainingCount: seen.size };
    } catch (err) {
      console.error('Error deduplicating products:', err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  const seedInitialData = async () => {
    try {
      setIsSyncing(true);
      const now = new Date().toISOString();

      // Products with deterministic doc IDs (prevents duplicates)
      for (const p of SAMPLE_PRODUCTS) {
        const docId = 'prod_' + (p.sku || p.name).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const pRef = doc(db, 'products', docId);
        await setDoc(pRef, {
          ...p,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      // Settings
      await setDoc(doc(db, 'settings', 'business_profile'), {
        ...DEFAULT_SETTINGS,
        updatedAt: now,
      }, { merge: true });

      // PS Rentals with deterministic IDs
      for (const r of SAMPLE_PS_RENTALS) {
        const rDocId = 'ps_' + r.unitName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const rRef = doc(db, 'ps_rentals', rDocId);
        await setDoc(rRef, {
          ...r,
          updatedAt: now,
        }, { merge: true });
      }

      // Debts with deterministic IDs
      for (const d of SAMPLE_DEBTS) {
        const dDocId = 'debt_' + d.customerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const dRef = doc(db, 'debts', dDocId);
        await setDoc(dRef, {
          ...d,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      // Initial expense
      const sampleExpenseRef = doc(db, 'expenses', 'exp_init_token');
      const todayStr = new Date().toISOString().split('T')[0];
      await setDoc(sampleExpenseRef, {
        title: 'Beli Bahan Baku & Listrik Token',
        category: 'Operasional',
        amount: 65000,
        notes: 'Token listrik rental & kantong plastik',
        createdBy: userProfile?.displayName || 'Admin',
        dateString: todayStr,
        createdAt: now,
      }, { merge: true });
    } catch (err) {
      console.error('Seed data error', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const resetAllData = async () => {
    if (!window.confirm('PERHATIAN: Tindakan ini akan MENGHAPUS SEMUA DATA di Firebase (Produk, Transaksi, Pengeluaran, Hutang, PS Rentals, dll.) secara permanen. Lanjutkan?')) {
      return;
    }
    setIsSyncing(true);
    try {
      const collectionsToClear = [
        'products',
        'transactions',
        'expenses',
        'debts',
        'ps_rentals',
        'ps_saved_times'
      ];

      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        const deletes = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletes);
      }

      localStorage.clear();
      alert('Semua data berhasil direset dan dikosongkan total dari Firebase!');
      window.location.reload();
    } catch (err) {
      console.error('Reset database error:', err);
      alert('Gagal mereset data database.');
    } finally {
      setIsSyncing(false);
    }
  };

  const createTransaction = async (
    items: CartItem[],
    paymentMethod: 'Tunai' | 'QRIS' | 'Transfer Bank' | 'Debit' | 'Hutang / Kas Bon',
    amountPaid: number,
    customerName: string = 'Pelanggan Umum',
    discount: number = 0,
    notes: string = '',
    adminFee: number = 0,
    customerPhone: string = '',
    dueDate: string = ''
  ): Promise<Transaction> => {
    setIsSyncing(true);
    try {
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${dateString.replace(/-/g, '')}-${randomPart}`;

      let totalAmount = 0;
      let totalCost = 0;

      const transactionItems = items.map((item) => {
        const subtotal = item.product.price * item.quantity;
        const subtotalCost = item.product.cost * item.quantity;
        totalAmount += subtotal;
        totalCost += subtotalCost;
        return {
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          cost: item.product.cost,
          quantity: item.quantity,
          subtotal,
        };
      });

      const finalAmount = Math.max(0, totalAmount - discount);
      let totalProfit = finalAmount - totalCost;

      // KHUSUS LAYANAN (PPOB, Range Transfer, E-Wallet, atau yang memiliki adminFee):
      // Hitungan laba HANYA admin fee-nya saja!
      const isLayanan = (adminFee !== undefined && adminFee > 0) || items.some((it) => 
        it.product.category === 'PPOB' || 
        it.product.masterType === 'ppob_range' || 
        Boolean(it.product.ppobProvider) || 
        Boolean(it.product.adminRanges)
      );

      if (isLayanan && adminFee && adminFee > 0) {
        totalProfit = Math.max(0, adminFee - discount);
        totalCost = Math.max(0, finalAmount - totalProfit);
      }

      // Handle optional amountPaid:
      // Kosong / 0 = Utang Full
      // Diisi < finalAmount = Bayar Sebagian (DP / Kas Bon Sebagian)
      // Diisi >= finalAmount = Lunas
      const rawPaid = typeof amountPaid === 'number' ? Math.max(0, amountPaid) : 0;
      const actualPaid = Math.min(finalAmount, rawPaid);
      const remainingDebt = Math.max(0, finalAmount - actualPaid);
      const hasDebt = remainingDebt > 0 || paymentMethod === 'Hutang / Kas Bon';
      const change = rawPaid > finalAmount ? (rawPaid - finalAmount) : 0;

      const newTxRef = doc(collection(db, 'transactions'));
      const txData: Omit<Transaction, 'id'> = {
        invoiceNumber,
        cashierName: userProfile?.displayName || 'Kasir',
        cashierId: userProfile?.uid || 'guest',
        customerName: customerName.trim() || (hasDebt ? 'Pelanggan Kas Bon' : 'Pelanggan Umum'),
        items: transactionItems,
        totalAmount,
        totalCost,
        totalProfit,
        discount,
        finalAmount,
        paymentMethod: hasDebt && actualPaid === 0 ? 'Hutang / Kas Bon' : paymentMethod,
        amountPaid: actualPaid,
        change,
        status: 'completed',
        notes: hasDebt
          ? `${notes ? notes + ' • ' : ''}${actualPaid > 0 ? `Bayar Sebagian DP Rp ${actualPaid.toLocaleString('id-ID')}, Sisa Hutang Rp ${remainingDebt.toLocaleString('id-ID')}` : 'Utang Full'}`
          : notes,
        adminFee,
        customerPhone,
        dateString,
        createdAt: now.toISOString(),
      };

      await runTransaction(db, async (t) => {
        for (const item of items) {
          if (!item.product.id.startsWith('custom-')) {
            const productRef = doc(db, 'products', item.product.id);
            const pSnap = await t.get(productRef);
            if (pSnap.exists()) {
              const currentStock = pSnap.data().stock || 0;
              const newStock = Math.max(0, currentStock - item.quantity);
              t.update(productRef, {
                stock: newStock,
                updatedAt: now.toISOString(),
              });
            }
          }
        }
        t.set(newTxRef, txData);
      });

      // If there is any debt (Utang Full or Bayar Sebagian), auto-create debt record
      if (hasDebt && remainingDebt > 0) {
        const debtRef = doc(collection(db, 'debts'));
        await setDoc(debtRef, {
          customerName: customerName.trim() || 'Pelanggan Kas Bon',
          customerPhone: customerPhone.trim(),
          amount: finalAmount,
          paidAmount: actualPaid,
          remainingAmount: remainingDebt,
          description: notes.trim() || `Transaksi ${invoiceNumber} (${items.map((i) => i.product.name).join(', ')})`,
          dueDate: dueDate || '',
          status: actualPaid > 0 ? 'partial' : 'unpaid',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }

      return {
        id: newTxRef.id,
        ...txData,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
      throw error;
    } finally {
      setIsSyncing(false);
    }
  };

  const cancelTransaction = async (transactionId: string) => {
    setIsSyncing(true);
    try {
      const txRef = doc(db, 'transactions', transactionId);
      await runTransaction(db, async (t) => {
        const snap = await t.get(txRef);
        if (!snap.exists()) return;
        const txData = snap.data() as Transaction;
        if (txData.status === 'cancelled') return;

        // Restore product stock
        for (const item of txData.items) {
          const pRef = doc(db, 'products', item.productId);
          const pSnap = await t.get(pRef);
          if (pSnap.exists()) {
            const currentStock = pSnap.data().stock || 0;
            t.update(pRef, {
              stock: currentStock + item.quantity,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        t.update(txRef, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: userProfile?.displayName || 'Admin',
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${transactionId}`);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  };

  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newDocRef = doc(collection(db, 'products'));
      const now = new Date().toISOString();
      await setDoc(newDocRef, {
        ...productData,
        isFuel: productData.category.toLowerCase().includes('bbm') || productData.isFuel || false,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products');
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      const docRef = doc(db, 'products', id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const docRef = doc(db, 'products', id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  const adjustStock = async (id: string, delta: number) => {
    try {
      const docRef = doc(db, 'products', id);
      const existing = products.find((p) => p.id === id);
      if (!existing) return;
      const newStock = Math.max(0, existing.stock + delta);
      await updateDoc(docRef, {
        stock: newStock,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    try {
      const newDocRef = doc(collection(db, 'expenses'));
      const now = new Date().toISOString();
      await setDoc(newDocRef, {
        ...expenseData,
        createdBy: userProfile?.displayName || 'Staf Usaha',
        createdAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const docRef = doc(db, 'expenses', id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
    }
  };

  // Debt Operations
  const addDebt = async (debtData: Omit<Debt, 'id' | 'createdAt' | 'remainingAmount'>) => {
    try {
      const newDocRef = doc(collection(db, 'debts'));
      const now = new Date().toISOString();
      const remainingAmount = Math.max(0, debtData.amount - (debtData.paidAmount || 0));
      const status: 'unpaid' | 'partial' | 'paid' =
        remainingAmount === 0 ? 'paid' : debtData.paidAmount > 0 ? 'partial' : 'unpaid';

      await setDoc(newDocRef, {
        ...debtData,
        remainingAmount,
        status,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'debts');
    }
  };

  const payDebt = async (id: string, amountToPay: number) => {
    try {
      const docRef = doc(db, 'debts', id);
      const existing = debts.find((d) => d.id === id);
      if (!existing) return;

      const newPaid = (existing.paidAmount || 0) + amountToPay;
      const newRemaining = Math.max(0, existing.amount - newPaid);
      const status = newRemaining <= 0 ? 'paid' : 'partial';

      await updateDoc(docRef, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `debts/${id}`);
    }
  };

  const deleteDebt = async (id: string) => {
    try {
      const docRef = doc(db, 'debts', id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `debts/${id}`);
    }
  };

  // PS Rental Operations (Realtime Firebase)
  const startPsRental = async (
    id: string, 
    customerName: string, 
    durationMinutes: number, 
    customCost?: number, 
    notes: string = '',
    savedTimeIdToConsume?: string
  ) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      const unit = psRentals.find((u) => u.id === id);
      if (!unit) return;

      const now = new Date();
      let expectedEndTime = '';
      let totalCost = 0;

      if (durationMinutes > 0) {
        const end = new Date(now.getTime() + durationMinutes * 60 * 1000);
        expectedEndTime = end.toISOString();
        totalCost = customCost !== undefined 
          ? customCost 
          : calculatePsRentalCost(unit, durationMinutes);
      }

      await updateDoc(docRef, {
        status: 'in_use',
        customerName: customerName.trim() || 'Pemain',
        startTime: now.toISOString(),
        durationMinutes,
        durationHours: durationMinutes > 0 ? durationMinutes / 60 : 0,
        expectedEndTime,
        totalCost,
        notes: notes.trim(),
        paymentStatus: 'unpaid',
        updatedAt: now.toISOString(),
      });

      // If customer is consuming a saved time balance, mark as used
      if (savedTimeIdToConsume) {
        const savedRef = doc(db, 'ps_saved_times', savedTimeIdToConsume);
        await updateDoc(savedRef, {
          status: 'used',
          usedAt: now.toISOString(),
          usedInUnitName: unit.unitName,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ps_rentals/${id}`);
    }
  };

  // Tambah Jam / Waktu Main Saat Sedang Berjalan (Otomatis Kalkulasi Waktu & Biaya)
  const addPsPlayTime = async (
    id: string, 
    addMinutes: number, 
    additionalCost?: number, 
    notes?: string
  ) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      const unit = psRentals.find((u) => u.id === id);
      if (!unit || unit.status !== 'in_use') return;

      const now = Date.now();
      let currentEndMs = unit.expectedEndTime ? new Date(unit.expectedEndTime).getTime() : now;
      // Jika waktu sebelumnya sudah habis (overtime), waktu tambahan dihitung mulai saat ini
      const baseMs = Math.max(now, currentEndMs);
      const newEndMs = baseMs + addMinutes * 60 * 1000;
      const newExpectedEndTime = new Date(newEndMs).toISOString();

      const extraCost = additionalCost !== undefined 
        ? additionalCost 
        : calculatePsRentalCost(unit, addMinutes);

      const newTotalCost = (unit.totalCost || 0) + extraCost;
      const currentDurationMin = unit.durationMinutes || (unit.durationHours ? Math.round(unit.durationHours * 60) : 0);
      const newDurationMinutes = currentDurationMin + addMinutes;

      await updateDoc(docRef, {
        expectedEndTime: newExpectedEndTime,
        durationMinutes: newDurationMinutes,
        durationHours: newDurationMinutes / 60,
        totalCost: newTotalCost,
        notes: notes ? `${unit.notes ? unit.notes + ' • ' : ''}${notes}` : unit.notes || '',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ps_rentals/${id}`);
    }
  };

  // Kasih Waktu Manual (Set Waktu / Biaya Langsung)
  const setPsManualTime = async (
    id: string, 
    newExpectedEndTime: string, 
    newCost?: number, 
    notes?: string
  ) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      const updates: any = {
        expectedEndTime: newExpectedEndTime,
        updatedAt: new Date().toISOString(),
      };
      if (newCost !== undefined) {
        updates.totalCost = newCost;
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }

      await updateDoc(docRef, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ps_rentals/${id}`);
    }
  };

  // Simpan Sisa Waktu Pelanggan (Pelanggan pulang lebih awal, simpan ke saldo waktu untuk main di kemudian hari)
  const savePsRemainingTime = async (
    unitId: string, 
    customerName: string, 
    remainingMinutes: number, 
    notes: string = ''
  ) => {
    try {
      const unit = psRentals.find((u) => u.id === unitId);
      const now = new Date().toISOString();
      const validMinutes = Math.max(1, Math.round(remainingMinutes));

      // 1. Simpan ke Firestore ps_saved_times
      const savedRef = doc(collection(db, 'ps_saved_times'));
      await setDoc(savedRef, {
        customerName: customerName.trim() || unit?.customerName || 'Pelanggan PS',
        customerPhone: unit?.customerPhone || '',
        remainingMinutes: validMinutes,
        savedFromUnitId: unitId,
        savedFromUnitName: unit?.unitName || '',
        psType: unit?.psType || 'PS4',
        notes: notes.trim() || `Disimpan dari ${unit?.unitName || 'PS'} pada ${new Date().toLocaleTimeString('id-ID')}`,
        savedAt: now,
        status: 'active',
      });

      // 2. Kosongkan unit PS agar langsung tersedia untuk disewa pemain lain
      const unitRef = doc(db, 'ps_rentals', unitId);
      await updateDoc(unitRef, {
        status: 'available',
        customerName: '',
        customerPhone: '',
        startTime: '',
        durationMinutes: 0,
        durationHours: 0,
        expectedEndTime: '',
        totalCost: 0,
        paymentStatus: 'unpaid',
        notes: '',
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ps_saved_times');
    }
  };

  // Gunakan Sisa Waktu Tersimpan untuk Main di Unit PS
  const usePsSavedTime = async (savedTimeId: string, unitId: string) => {
    try {
      const saved = psSavedTimes.find((s) => s.id === savedTimeId);
      const unit = psRentals.find((u) => u.id === unitId);
      if (!saved || !unit || unit.status !== 'available') return;

      await startPsRental(
        unitId,
        saved.customerName,
        saved.remainingMinutes,
        0, // Biaya 0 karena sisa waktu dari pembayaran sebelumnya
        `Pakai Tabungan Sisa Waktu (${saved.remainingMinutes} mnt dari ${saved.savedFromUnitName || 'PS'})`,
        savedTimeId
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ps_saved_times/${savedTimeId}`);
    }
  };

  // Hapus Tabungan Sisa Waktu
  const deletePsSavedTime = async (savedTimeId: string) => {
    try {
      const docRef = doc(db, 'ps_saved_times', savedTimeId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ps_saved_times/${savedTimeId}`);
    }
  };

  // Tambah Tabungan Sisa Waktu Manual
  const addPsSavedTimeManual = async (
    customerName: string, 
    remainingMinutes: number, 
    notes: string = '', 
    customerPhone: string = ''
  ) => {
    try {
      const docRef = doc(collection(db, 'ps_saved_times'));
      await setDoc(docRef, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        remainingMinutes: Math.max(1, Math.round(remainingMinutes)),
        notes: notes.trim(),
        savedAt: new Date().toISOString(),
        status: 'active',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ps_saved_times');
    }
  };

  // Selesai Rental & Pembayaran
  const stopPsRental = async (id: string, isPaid: boolean) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      const unit = psRentals.find((u) => u.id === id);
      if (!unit) return;

      // Hitung total biaya jika open billing (khusus open billing: per jam dibagi 60 menit)
      let finalCost = unit.totalCost || 0;
      const hasDefinedDuration = (unit.durationMinutes && unit.durationMinutes > 0) || (unit.durationHours && unit.durationHours > 0);
      if (!hasDefinedDuration && unit.startTime) {
        const start = new Date(unit.startTime).getTime();
        const diffMs = Math.max(0, Date.now() - start);
        const minutes = Math.max(1, Math.ceil(diffMs / 60000));
        const ratePerMinute = (unit.hourlyRate || 5000) / 60;
        finalCost = Math.round(minutes * ratePerMinute);
      }

      // Jika user bayar, simpan transaksi pendapatan
      if (isPaid && finalCost > 0) {
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const dateStr = new Date().toISOString().split('T')[0];
        const newTxRef = doc(collection(db, 'transactions'));
        await setDoc(newTxRef, {
          invoiceNumber: `INV-PS-${dateStr.replace(/-/g, '')}-${randomPart}`,
          cashierName: userProfile?.displayName || 'Kasir PS',
          cashierId: userProfile?.uid || 'guest',
          customerName: unit.customerName || 'Pemain PS',
          items: [
            {
              productId: `rental-${unit.id}`,
              name: `Rental ${unit.unitName}`,
              price: finalCost,
              cost: 0,
              quantity: 1,
              subtotal: finalCost,
            },
          ],
          totalAmount: finalCost,
          totalCost: 0,
          totalProfit: finalCost,
          discount: 0,
          finalAmount: finalCost,
          paymentMethod: 'Tunai',
          amountPaid: finalCost,
          change: 0,
          status: 'completed',
          dateString: dateStr,
          createdAt: new Date().toISOString(),
        });
      }

      // Reset unit ke status tersedia
      await updateDoc(docRef, {
        status: 'available',
        customerName: '',
        customerPhone: '',
        startTime: '',
        durationMinutes: 0,
        durationHours: 0,
        expectedEndTime: '',
        totalCost: 0,
        paymentStatus: 'unpaid',
        notes: '',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ps_rentals/${id}`);
    }
  };

  const addPsUnit = async (unitData: Omit<PsRental, 'id' | 'status' | 'updatedAt'>) => {
    try {
      const docRef = doc(collection(db, 'ps_rentals'));
      await setDoc(docRef, {
        ...unitData,
        hourlyRate: Number(unitData.hourlyRate) || 5000,
        halfHourlyRate: Number(unitData.halfHourlyRate) || 3000,
        status: 'available',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ps_rentals');
    }
  };

  const updatePsUnit = async (id: string, updates: Partial<PsRental>) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ps_rentals/${id}`);
    }
  };

  const deletePsUnit = async (id: string) => {
    try {
      const docRef = doc(db, 'ps_rentals', id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ps_rentals/${id}`);
    }
  };

  const updateSettings = async (newSettings: Partial<BusinessSettings>) => {
    try {
      const docRef = doc(db, 'settings', 'business_profile');
      await setDoc(docRef, {
        ...settings,
        ...newSettings,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/business_profile');
    }
  };

  return (
    <DataContext.Provider
      value={{
        products,
        transactions,
        expenses,
        debts,
        psRentals,
        psSavedTimes,
        settings,
        isRealtimeConnected,
        isSyncing,
        createTransaction,
        cancelTransaction,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        addExpense,
        deleteExpense,
        addDebt,
        payDebt,
        deleteDebt,
        startPsRental,
        stopPsRental,
        addPsPlayTime,
        setPsManualTime,
        savePsRemainingTime,
        usePsSavedTime,
        deletePsSavedTime,
        addPsSavedTimeManual,
        addPsUnit,
        updatePsUnit,
        deletePsUnit,
        updateSettings,
        seedInitialData,
        cleanDuplicateProducts,
        resetAllData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

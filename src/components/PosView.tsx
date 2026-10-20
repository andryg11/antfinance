import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Coins, 
  User, 
  FileText, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Building2, 
  Wallet, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  X, 
  AlertCircle, 
  Sparkles,
  Phone,
  Calendar,
  Layers,
  Receipt,
  Smartphone,
  Package,
  ArrowRight,
  RotateCcw,
  Camera,
  ScanLine
} from 'lucide-react';
import { useData, DEFAULT_ADMIN_TIERS, getProductAdminRanges } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Product, CartItem, Transaction, AdminFeeTier } from '../types';
import { formatRupiah, formatNumberWithDots, parseNumberFromDots } from '../utils/formatters';
import { ReceiptModal } from './ReceiptModal';
import { ScannerModal } from './ScannerModal';

export const PosView: React.FC = () => {
  const { products, createTransaction, settings, isSyncing } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  // STEP 1 -> STEP 2: Selected Item (after user clicks an item in the search list)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form Inputs for the Selected Item
  const [nominal, setNominal] = useState<number>(100000);
  const [quantity, setQuantity] = useState<number>(1);
  const [adminFee, setAdminFee] = useState<number>(2000);
  const [adminRangeText, setAdminRangeText] = useState<string>('Range Rp 10.000 - Rp 100.000');
  
  // Customer & Notes
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Payment State (Kosong = Utang Full, Diisi < Total = Bayar Sebagian, Diisi >= Total = Lunas)
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS' | 'Transfer Bank' | 'Debit' | 'Hutang / Kas Bon'>('Tunai');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);

  // Feedback & Receipt Modal
  const [completedTx, setCompletedTx] = useState<Transaction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate dynamic admin fee from the SELECTED PRODUCT's own admin ranges (from Data Master)
  const calculateProductAdminFee = (prod: Product | null, amount: number): { fee: number; rangeLabel: string } => {
    if (!prod || amount <= 0) return { fee: 0, rangeLabel: 'Rp 0' };

    const ranges = getProductAdminRanges(prod);
    if (!ranges || ranges.length === 0) {
      return { fee: 2000, rangeLabel: 'Admin Standar Rp 2.000' };
    }

    // Sort ascending by min
    const sorted = [...ranges].sort((a, b) => a.min - b.min);

    for (const tier of sorted) {
      if (amount >= tier.min && amount <= tier.max) {
        const maxText = tier.max > 100000000 ? 'Keatas' : formatRupiah(tier.max);
        return {
          fee: tier.fee,
          rangeLabel: `Rentang ${prod.name}: ${formatRupiah(tier.min)} - ${maxText} (Admin: ${formatRupiah(tier.fee)})`,
        };
      }
    }

    if (amount < sorted[0].min) {
      return {
        fee: sorted[0].fee,
        rangeLabel: `Dibawah rentang minimal (${formatRupiah(sorted[0].min)}) -> Admin ${formatRupiah(sorted[0].fee)}`,
      };
    }

    // Fallback: highest tier
    const lastTier = sorted[sorted.length - 1];
    return {
      fee: lastTier.fee,
      rangeLabel: `Diatas rentang maksimal (${formatRupiah(lastTier.max)}) -> Admin ${formatRupiah(lastTier.fee)}`,
    };
  };

  // Determine if selected product is PPOB Range (dynamic nominal & admin)
  const isPpobRange = useMemo(() => {
    if (!selectedProduct) return false;
    if (selectedProduct.masterType === 'ppob_range') return true;
    const cat = selectedProduct.category.toLowerCase();
    const name = selectedProduct.name.toLowerCase();
    return (
      cat.includes('ppob range') ||
      name.includes('dana') ||
      name.includes('gopay') ||
      name.includes('ovo') ||
      name.includes('shopee') ||
      name.includes('transfer')
    );
  }, [selectedProduct]);

  // Recalculate admin fee when nominal or selected product changes
  useEffect(() => {
    if (isPpobRange && selectedProduct && nominal > 0) {
      const calc = calculateProductAdminFee(selectedProduct, nominal);
      setAdminFee(calc.fee);
      setAdminRangeText(calc.rangeLabel);
    } else if (!isPpobRange) {
      setAdminFee(0);
      setAdminRangeText('Harga Produk Standar');
    }
  }, [nominal, selectedProduct, isPpobRange]);

  // Filter products list
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return products; // show full list
    }
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery]);

  // USER CLICKS AN ITEM FROM THE LIST -> PROCEEDS TO STEP 2 (INPUT NOMINAL & FORM)
  const handleItemClick = (product: Product) => {
    setSelectedProduct(product);
    setErrorMessage(null);

    const isRange =
      product.masterType === 'ppob_range' ||
      product.category.toLowerCase().includes('ppob range') ||
      product.name.toLowerCase().includes('dana') ||
      product.name.toLowerCase().includes('gopay') ||
      product.name.toLowerCase().includes('ovo') ||
      product.name.toLowerCase().includes('transfer');

    if (isRange) {
      setNominal(100000);
      const calc = calculateProductAdminFee(product, 100000);
      setAdminFee(calc.fee);
      setAdminRangeText(calc.rangeLabel);
      setQuantity(1);
    } else {
      // Barang / Pulsa (Fixed selling price and cost)
      setNominal(product.price);
      setAdminFee(0);
      setAdminRangeText('Harga Produk Standar');
      setQuantity(1);
    }
  };

  const handleResetSelection = () => {
    setSelectedProduct(null);
    setErrorMessage(null);
  };

  // Quick Nominal Recommendations
  const quickRecommendations = [10000, 20000, 50000, 100000, 200000, 500000, 1000000];

  // Calculations for total bill & debt
  const totalAmount = isPpobRange
    ? (nominal || 0) + (adminFee || 0)
    : (selectedProduct?.price || nominal) * (quantity || 1);

  const finalTagihan = Math.max(0, totalAmount - (discount || 0));

  const isHutang = paymentMethod === 'Hutang / Kas Bon';
  const isLunas = !isHutang;

  // Parsing uang diterima:
  // - Jika LUNAS: Otomatis lunas penuh (tidak ada input uang diterima)
  // - Jika HUTANG: Kosong = Utang Full (0), Diisi = Bayar Sebagian / DP
  const numPaid = isHutang ? (cashGiven === '' ? 0 : Number(cashGiven) || 0) : finalTagihan;
  const isFullDebt = isHutang && (cashGiven === '' || numPaid === 0);
  const isPartialDebt = isHutang && numPaid > 0 && numPaid < finalTagihan;
  const remainingDebt = isHutang ? Math.max(0, finalTagihan - numPaid) : 0;
  const hasDebt = isHutang;
  const changeAmount = isHutang && numPaid > finalTagihan ? (numPaid - finalTagihan) : 0;

  // Checkout execution
  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedProduct) {
      setErrorMessage('Silakan pilih salah satu item/layanan dari daftar terlebih dahulu!');
      return;
    }

    if (finalTagihan <= 0) {
      setErrorMessage('Total tagihan transaksi harus lebih dari Rp 0!');
      return;
    }

    // MANDATORY check: Nama pelanggan HANYA untuk hutang saja!
    if (isHutang && !customerName.trim()) {
      setErrorMessage('Nama Pelanggan WAJIB DIISI jika transaksi berstatus Hutang!');
      return;
    }

    setIsSubmitting(true);
    try {
      const cartItems: CartItem[] = [
        {
          product: {
            ...selectedProduct,
            price: isPpobRange ? totalAmount : selectedProduct.price,
            cost: isPpobRange ? nominal : selectedProduct.cost,
          },
          quantity: isPpobRange ? 1 : quantity,
          price: isPpobRange ? totalAmount : selectedProduct.price,
          subtotal: isPpobRange ? totalAmount : (selectedProduct.price * quantity),
        },
      ];

      const tx = await createTransaction(
        cartItems,
        isHutang ? 'Hutang / Kas Bon' : paymentMethod,
        isHutang ? numPaid : finalTagihan,
        isHutang ? customerName.trim() : 'Pelanggan Umum',
        discount,
        notes.trim(),
        adminFee,
        isHutang ? customerPhone.trim() : '',
        isHutang ? dueDate : ''
      );

      // Reset
      setSelectedProduct(null);
      setSearchQuery('');
      setNotes('');
      setCustomerName('');
      setCustomerPhone('');
      setDueDate('');
      setCashGiven('');
      setDiscount(0);
      setCompletedTx(tx);
    } catch (err: any) {
      console.error('Transaction error:', err);
      setErrorMessage(err.message || 'Gagal memproses transaksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Transaksi Kasir (PPOB, Pulsa & Barang)</h1>
        <p className="text-xs text-slate-500">
          Cari layanan di kolom pencarian, klik item pada daftar, lalu tuliskan nominal dan rincian transaksi.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-5 sm:p-7 space-y-6">
        
        {/* ============================================================ */}
        {/* LANGKAH 1: CARI DI TRANSAKSI (MUNCUL LIST, BUKAN KOTAK-KOTAK) */}
        {/* ============================================================ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Cari Layanan / Barang / Pulsa (Ketik & Klik dari List)
            </label>
            {selectedProduct && (
              <button
                type="button"
                onClick={handleResetSelection}
                className="text-xs text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Pilih Item Lain</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ketik untuk mencari: DANA, pulsa, pertalite, voucher kuota, sembako..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  title="Hapus pencarian"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-600 hover:text-teal-700 p-1 rounded-lg"
                  title="Scan dengan Kamera HP"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Tombol Scan Sejajar dengan Bar Pencarian - Mengarah ke Kamera HP (AI Vision Kuota GB & Barcode/QR) */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-[50px] px-3.5 sm:px-4 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-2xl flex items-center justify-center gap-2 shadow-xs transition shrink-0 cursor-pointer group"
              title="Scan Voucher Kuota GB (AI Vision) / Barcode & QR Code Data Master"
            >
              <ScanLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline">Scan (Kamera HP)</span>
            </button>
          </div>

          {/* LIST DAFTAR PENCARIAN (FORMAT LIST BERSIH, BUKAN KOTAK-KOTAK) */}
          {!selectedProduct && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white max-h-64 overflow-y-auto shadow-xs">
              {searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {isAdmin
                    ? `Tidak ditemukan item dengan nama "${searchQuery}". Tambahkan item baru di menu Data Master.`
                    : `Tidak ditemukan item dengan nama "${searchQuery}". Silakan hubungi Admin untuk mendaftarkan barang baru.`}
                </div>
              ) : (
                searchResults.map((p) => {
                  const isRange = p.masterType === 'ppob_range' || p.category.toLowerCase().includes('ppob range') || p.name.toLowerCase().includes('dana');
                  const isPulsa = p.category.toLowerCase().includes('pulsa');

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleItemClick(p)}
                      className="px-4 py-3 flex items-center justify-between hover:bg-teal-50/70 transition cursor-pointer select-none group"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isRange
                              ? 'bg-blue-100 text-blue-700'
                              : isPulsa
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isRange ? 'PPOB' : isPulsa ? 'PULSA' : 'BRG'}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {p.category} • SKU: {p.sku || '-'} • Sisa Stok: {p.stock} {p.unit}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {isRange ? (
                          <div>
                            <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-[11px] rounded-lg">
                              Nominal Bebas + Admin
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {p.adminRanges && p.adminRanges.length > 0
                                ? `${p.adminRanges.length} rentang admin`
                                : 'Admin otomatis'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-bold text-slate-900">{formatRupiah(p.price)}</div>
                            <div className="text-[10px] text-slate-400">Modal: {formatRupiah(p.cost)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* LANGKAH 2: SETELAH DI-KLIK, BARU MUNCUL FORM NOMINAL DLL     */}
        {/* ============================================================ */}
        {selectedProduct ? (
          <form onSubmit={handleProcessTransaction} className="space-y-5 pt-4 border-t border-slate-200 animate-in fade-in duration-200">
            {/* Banner Item yang Dipilih */}
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
                  ✓
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                    Item Terpilih ({selectedProduct.category})
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {selectedProduct.name}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetSelection}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Ganti Item
              </button>
            </div>

            {/* A. JIKA PPOB RANGE (DANA, GOPAY, TRANSFER): TULIS NOMINAL & HITUNG ADMIN RANGE */}
            {isPpobRange ? (
              <div className="space-y-4 p-5 bg-slate-50/70 rounded-2xl border border-slate-200">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    2. Tulis Nominal {selectedProduct.name} (Rp)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                      Rp
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatNumberWithDots(nominal)}
                      onChange={(e) => setNominal(parseNumberFromDots(e.target.value))}
                      placeholder="0"
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-300 rounded-2xl text-xl font-extrabold text-teal-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  {/* Rekomendasi Nominal */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500">Rekomendasi Nominal:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {quickRecommendations.map((rec) => (
                        <button
                          key={rec}
                          type="button"
                          onClick={() => setNominal(rec)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            nominal === rec
                              ? 'bg-teal-700 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {formatRupiah(rec)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* BIAYA ADMIN SESUAI RANGE */}
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Biaya Admin Transaksi
                      </span>
                      <p className="text-[11px] text-teal-700 font-semibold">
                        {adminRangeText}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 font-medium">Biaya Admin:</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                          Rp
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          value={adminFee || ''}
                          onChange={(e) => setAdminFee(Number(e.target.value))}
                          className="w-28 pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-extrabold text-slate-900 text-right focus:ring-1 focus:ring-teal-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-semibold">
                      Nominal ({formatRupiah(nominal)}) + Biaya Admin ({formatRupiah(adminFee)}):
                    </span>
                    <span className="text-base font-extrabold text-teal-800">
                      Total Tagihan: {formatRupiah(finalTagihan)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* B. JIKA BARANG / PULSA: HARGA TETAP DENGAN JUMLAH/QTY */
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700">Harga Satuan Produk:</span>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {formatRupiah(selectedProduct.price)}{' '}
                    <span className="text-xs font-normal text-slate-500">/ {selectedProduct.unit}</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold">
                    Modal (HPP): {formatRupiah(selectedProduct.cost)} • Keuntungan: +{formatRupiah(selectedProduct.price - selectedProduct.cost)}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-slate-600">Jumlah (Qty):</span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-300 font-bold text-base flex items-center justify-center hover:bg-slate-100"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                      className="w-14 text-center font-bold text-sm py-1.5 bg-white border border-slate-300 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-8 h-8 rounded-xl bg-teal-600 text-white font-bold text-base flex items-center justify-center hover:bg-teal-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STATUS PEMBAYARAN: LUNAS VS HUTANG / KAS BON */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  3. Status Pembayaran
                </label>
                <span
                  className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                    isHutang
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isHutang ? 'Transaksi Hutang' : 'Transaksi Lunas'}
                </span>
              </div>

              {/* Pilihan Utama: Lunas vs Hutang */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (paymentMethod === 'Hutang / Kas Bon') {
                      setPaymentMethod('Tunai');
                    }
                    setCashGiven('');
                  }}
                  className={`py-3 px-4 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    !isHutang
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>LUNAS</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Hutang / Kas Bon');
                    setCashGiven('');
                  }}
                  className={`py-3 px-4 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    isHutang
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/25 ring-2 ring-rose-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>HUTANG / KAS BON</span>
                </button>
              </div>

              {/* JIKA PILIHAN LUNAS: PILIH METODE BAYAR, TANPA UANG DITERIMA & TANPA NAMA PELANGGAN */}
              {!isHutang ? (
                <div className="space-y-2.5 pt-1 animate-in fade-in">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Metode Bayar Lunas:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {[
                        { id: 'Tunai', label: 'Tunai (Cash)', icon: Banknote },
                        { id: 'QRIS', label: 'QRIS', icon: QrCode },
                        { id: 'Transfer Bank', label: 'Transfer', icon: Building2 },
                        { id: 'Debit', label: 'Debit', icon: CreditCard },
                      ].map((m) => {
                        const Icon = m.icon;
                        const isSelected = paymentMethod === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPaymentMethod(m.id as any)}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition cursor-pointer ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-extrabold shadow-xs'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-700' : 'text-slate-500'}`} />
                            <span className="truncate text-xs font-bold">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Status Pembayaran <b>LUNAS ({formatRupiah(finalTagihan)})</b> via <b>{paymentMethod}</b>. Transaksi langsung selesai tanpa perlu input uang diterima maupun nama pelanggan.
                    </span>
                  </div>
                </div>
              ) : (
                /* JIKA PILIHAN HUTANG / KAS BON: NAMA PELANGGAN WAJIB & UANG DITERIMA OPSIONAL */
                <div className="space-y-3.5 pt-1 animate-in fade-in">
                  {/* A. NAMA PELANGGAN (WAJIB UNTUK HUTANG) */}
                  <div className="space-y-1.5 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-rose-600" />
                        <span>Nama Pelanggan</span>
                        <span className="text-rose-600 font-extrabold text-xs">* (Wajib Diisi)</span>
                      </label>
                      <span className="text-[10px] text-rose-600 font-bold">Wajib untuk hutang</span>
                    </div>

                    <input
                      type="text"
                      placeholder="Ketik nama pelanggan yang berhutang..."
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                      className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs font-semibold focus:outline-hidden transition ${
                        !customerName.trim()
                          ? 'border-rose-300 ring-2 ring-rose-200 focus:border-rose-500'
                          : 'border-slate-300 focus:ring-2 focus:ring-rose-500'
                      }`}
                    />

                    {/* Kontak & Janji Bayar (Opsional) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          type="text"
                          placeholder="No. WhatsApp / HP (opsional)"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                        />
                      </div>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                          title="Tanggal Janji Bayar"
                        />
                      </div>
                    </div>
                  </div>

                  {/* B. UANG DITERIMA / TITIP BAYAR (OPSIONAL: KOSONG = UTANG FULL, DIISI = BAYAR SEBAGIAN) */}
                  <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-rose-950 uppercase tracking-wider text-xs">
                          Uang Diterima / Titip Bayar Sekarang (Opsional)
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Kosong = <b>Utang Full</b>. Tulis nominal jika pembeli <b>Bayar Sebagian (DP)</b>.
                        </p>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={cashGiven === '' ? '' : formatNumberWithDots(Number(cashGiven))}
                          onChange={(e) => {
                            const val = parseNumberFromDots(e.target.value);
                            setCashGiven(val === 0 ? '' : String(val));
                          }}
                          placeholder="0 (Utang Full)"
                          className="w-48 pl-9 pr-3 py-2 bg-white border border-rose-300 rounded-xl text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-right"
                        />
                      </div>
                    </div>

                    {/* Status Ringkasan Hutang */}
                    {isFullDebt ? (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          <span className="font-bold text-amber-900">Status: UTANG FULL (Rp 0 Dibayar)</span>
                        </div>
                        <span className="font-extrabold text-rose-600 text-sm">
                          Sisa Hutang: {formatRupiah(finalTagihan)}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          <span className="font-bold text-blue-900">
                            Status: BAYAR SEBAGIAN (DP: {formatRupiah(numPaid)})
                          </span>
                        </div>
                        <span className="font-extrabold text-rose-600 text-sm">
                          Sisa Hutang: {formatRupiah(remainingDebt)}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setCashGiven('')}
                        className="px-3 py-1 bg-white border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-lg font-bold text-[11px] transition cursor-pointer"
                      >
                        Utang Full (Kosongkan Rp 0)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. CATATAN TAMBAHAN */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                4. Catatan Tambahan (Opsional)
              </label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-3 text-slate-400 w-4 h-4" />
                <textarea
                  rows={2}
                  placeholder="Contoh: No. Akun DANA 0812-3456-7890 / No. Meter Listrik / No. Rekening / Catatan khusus"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Error Message Feedback */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isSyncing}
              className={`w-full py-4 rounded-2xl font-extrabold text-sm shadow-lg flex items-center justify-center space-x-2 transition active:scale-98 cursor-pointer ${
                paymentMethod === 'Hutang / Kas Bon'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/30'
              }`}
            >
              {isSubmitting ? (
                <span>Memproses Transaksi...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {paymentMethod === 'Hutang / Kas Bon'
                      ? isFullDebt
                        ? 'Simpan Transaksi Kas Bon'
                        : 'Simpan Pembayaran Sebagian (DP)'
                      : 'Selesaikan Transaksi'}
                  </span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Silakan ketik dan <b>klik salah satu layanan atau barang</b> pada daftar di atas untuk melanjutkan pengisian transaksi.
          </div>
        )}
      </div>

      {/* Struk Kasir Modal */}
      {completedTx && (
        <ReceiptModal
          transaction={completedTx}
          settings={settings}
          onClose={() => setCompletedTx(null)}
        />
      )}

      {/* Scanner Modal (AI Vision Kuota GB & Barcode/QR) */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        onSelectProduct={(product) => {
          handleItemClick(product);
        }}
        onApplySearchQuery={(query) => {
          setSearchQuery(query);
        }}
      />
    </div>
  );
};

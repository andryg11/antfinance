import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  AlertTriangle, 
  Fuel, 
  CreditCard, 
  ChevronRight, 
  Plus, 
  Coins, 
  CheckCircle2, 
  Package, 
  User, 
  Phone, 
  Gamepad2, 
  Wallet, 
  ArrowUpRight,
  Eye,
  X,
  Sparkles
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Transaction, Product, Debt, PsRental } from '../types';
import { formatRupiah, formatDateTime, formatTime } from '../utils/formatters';

interface DashboardTodayViewProps {
  onNavigateTab: (tab: string) => void;
}

export const DashboardTodayView: React.FC<DashboardTodayViewProps> = ({ onNavigateTab }) => {
  const { 
    products, 
    transactions, 
    expenses, 
    debts, 
    psRentals, 
    psSavedTimes,
    adjustStock, 
    addDebt, 
    payDebt, 
    deleteDebt,
    settings 
  } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Live Clock & Date State
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = useMemo(() => {
    return currentDateTime.toISOString().split('T')[0];
  }, [currentDateTime]);

  // Formatted Indonesian Day and Date: e.g. "Senin, 19 Oktober 2026"
  const formattedDayAndDate = useMemo(() => {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(currentDateTime);
  }, [currentDateTime]);

  const formattedLiveClock = useMemo(() => {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(currentDateTime);
  }, [currentDateTime]);

  // Today's Transactions & Expenses
  const todayTransactions = useMemo(() => {
    return transactions.filter(
      (t) => t.dateString === todayStr && t.status === 'completed'
    );
  }, [transactions, todayStr]);

  const todayExpenses = useMemo(() => {
    return expenses.filter((e) => e.dateString === todayStr);
  }, [expenses, todayStr]);

  // Today's Calculations
  const metrics = useMemo(() => {
    // 1. Omset Hari Ini
    const omsetHariIni = todayTransactions.reduce((acc, t) => acc + t.finalAmount, 0);

    // 2. Laba Kotor Hari Ini
    // Khusus layanan yang ada admin fee, laba dihitung HANYA admin-nya saja!
    const labaKotor = todayTransactions.reduce((acc, t) => {
      if (t.adminFee && t.adminFee > 0) {
        return acc + Math.max(0, t.adminFee - (t.discount || 0));
      }
      return acc + (t.totalProfit !== undefined ? t.totalProfit : (t.finalAmount - (t.totalCost || 0)));
    }, 0);
    const modalHPP = omsetHariIni - labaKotor;

    // 3. Laba Bersih Hari Ini (Laba Kotor - Pengeluaran Operasional Hari Ini)
    const bebanPengeluaran = todayExpenses.reduce((acc, e) => acc + e.amount, 0);
    const labaBersih = labaKotor - bebanPengeluaran;

    // 4. Transaksi Hari Ini
    const transaksiHariIni = todayTransactions.length;

    // 5. Hutang Pelanggan (Total sisa hutang yang belum lunas)
    const unpaidDebts = debts.filter((d) => d.status !== 'paid');
    const totalHutangPelanggan = unpaidDebts.reduce((acc, d) => acc + d.remainingAmount, 0);

    // 6. Stok Menipis (Stok <= minStock atau habis)
    const lowStockProducts = products.filter((p) => p.stock <= (p.minStock || 5));
    const totalStokMenipis = lowStockProducts.length;

    // 7. Stok BBM Tersedia (Total liter BBM: Pertalite, Pertamax, Solar)
    const bbmProducts = products.filter(
      (p) => p.isFuel || p.category.toLowerCase().includes('bbm')
    );
    const totalStokBbm = bbmProducts.reduce((acc, p) => acc + p.stock, 0);

    return {
      omsetHariIni,
      labaKotor,
      labaBersih,
      transaksiHariIni,
      totalHutangPelanggan,
      totalStokMenipis,
      totalStokBbm,
      bbmProducts,
      lowStockProducts,
      unpaidDebts,
    };
  }, [todayTransactions, todayExpenses, debts, products]);

  // 5 Transaksi Terakhir
  const last5Transactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  // Modals
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [debtForm, setDebtForm] = useState({
    customerName: '',
    customerPhone: '',
    amount: 50000,
    paidAmount: 0,
    description: '',
    dueDate: '',
  });

  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [payAmountInput, setPayAmountInput] = useState<number>(0);

  const [adjustingStockProduct, setAdjustingStockProduct] = useState<Product | null>(null);
  const [quickDelta, setQuickDelta] = useState<number>(10);

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtForm.customerName.trim() || debtForm.amount <= 0) return;
    await addDebt({
      customerName: debtForm.customerName.trim(),
      customerPhone: debtForm.customerPhone.trim(),
      amount: Number(debtForm.amount),
      paidAmount: Number(debtForm.paidAmount || 0),
      description: debtForm.description.trim() || 'Kas bon belanja usaha',
      dueDate: debtForm.dueDate || '',
      status: debtForm.paidAmount >= debtForm.amount ? 'paid' : debtForm.paidAmount > 0 ? 'partial' : 'unpaid',
    });
    setDebtForm({ customerName: '', customerPhone: '', amount: 50000, paidAmount: 0, description: '', dueDate: '' });
    setIsAddDebtOpen(false);
  };

  const handlePayDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebt || payAmountInput <= 0) return;
    await payDebt(payingDebt.id, payAmountInput);
    setPayingDebt(null);
    setPayAmountInput(0);
  };

  const handleSaveQuickStock = async () => {
    if (!adjustingStockProduct) return;
    await adjustStock(adjustingStockProduct.id, quickDelta);
    setAdjustingStockProduct(null);
  };

  return (
    <div className="space-y-6 relative pb-12">
      {/* 1. Header Dashboard Usaha Hari Ini dengan Hari & Tanggal */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-400 font-semibold text-xs tracking-wider uppercase">
            <Calendar className="w-4 h-4" />
            <span>Dashboard Usaha Hari Ini</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight text-white capitalize">
            {formattedDayAndDate}
          </h1>
          <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
            <span className="font-semibold text-teal-300">{settings.businessName}</span>
            <span>•</span>
            <span className="font-mono bg-slate-800/80 px-2 py-0.5 rounded text-teal-200">
              🕒 {formattedLiveClock} WIB
            </span>
          </p>
        </div>

        {/* Quick action buttons on header */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('rental_ps')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Rental PS ({psRentals.filter((u) => u.status === 'in_use').length} Main)</span>
          </button>

          <button
            onClick={() => onNavigateTab('pos')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Buka Kasir POS</span>
          </button>
        </div>
      </div>

      {/* 2. Grid 7 Perhitungan Metrik Utama Hari Ini */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {/* Omset Hari Ini */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Omset Hari Ini</span>
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {formatRupiah(metrics.omsetHariIni)}
            </div>
            <p className="text-[10px] text-teal-700 font-medium mt-0.5">Penjualan kotor berhasil</p>
          </div>
        </div>

        {/* Laba Kotor */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Laba Kotor</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-blue-900 truncate">
              {formatRupiah(metrics.labaKotor)}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Omset - Modal (HPP)</p>
          </div>
        </div>

        {/* Laba Bersih */}
        <div className="bg-emerald-900 text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-200 uppercase">Laba Bersih</span>
            <div className="p-2 bg-emerald-800 text-emerald-300 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-white truncate">
              {formatRupiah(metrics.labaBersih)}
            </div>
            <p className="text-[10px] text-emerald-300 mt-0.5">Setelah dikurangi beban usaha</p>
          </div>
        </div>

        {/* Transaksi Hari Ini */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Transaksi Hari Ini</span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-slate-900">
              {metrics.transaksiHariIni}{' '}
              <span className="text-xs font-normal text-slate-500">transaksi</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Nota belanja tercatat</p>
          </div>
        </div>

        {/* Hutang Pelanggan */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Hutang Pelanggan</span>
            <div className="p-2 bg-rose-50 text-rose-700 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-rose-600 truncate">
              {formatRupiah(metrics.totalHutangPelanggan)}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {metrics.unpaidDebts.length} pelanggan belum lunas
            </p>
          </div>
        </div>

        {/* Stok Menipis */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Stok Menipis</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-amber-600">
              {metrics.totalStokMenipis}{' '}
              <span className="text-xs font-normal text-slate-500">item</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Perlu segera di-restock</p>
          </div>
        </div>

        {/* Stok BBM Tersedia */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Stok BBM Tersedia</span>
            <div className="p-2 bg-orange-50 text-orange-700 rounded-xl">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-xl font-bold text-orange-600">
              {metrics.totalStokBbm}{' '}
              <span className="text-xs font-normal text-slate-500">Liter</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {metrics.bbmProducts.length} jenis BBM siap dijual
            </p>
          </div>
        </div>
      </div>

      {/* 3. Section: Rental PlayStation Overview Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Status Rental PlayStation</h3>
              <p className="text-[11px] text-slate-400">
                {psRentals.filter((u) => u.status === 'in_use').length} unit sedang digunakan • {psRentals.filter((u) => u.status === 'available').length} unit siap main
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('rental_ps')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>Kelola Rental PS</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Horizontal Mini Cards for PS Stations */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {psRentals.map((u) => (
            <div
              key={u.id}
              onClick={() => onNavigateTab('rental_ps')}
              className={`p-3 rounded-xl border text-xs cursor-pointer transition hover:scale-[1.02] ${
                u.status === 'in_use'
                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                  : 'bg-slate-50 border-slate-100 text-slate-700'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">{u.unitName}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    u.status === 'in_use' ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'
                  }`}
                />
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {u.status === 'in_use' ? `Pemain: ${u.customerName || 'Aktif'}` : 'Kosong'}
              </div>
              <div className="text-[10px] text-indigo-700 font-bold mt-1">
                {formatRupiah(u.hourlyRate)}/jam
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Section: Riwayat 5 Transaksi Terakhir + Tombol Lihat Selengkapnya */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">5 Transaksi Terakhir</h3>
              <p className="text-[11px] text-slate-400">Aktivitas penjualan kasir terbaru</p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('transactions')}
            className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
          >
            <span>Lihat Selengkapnya</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {last5Transactions.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
            Riwayat transaksi belum ada
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {last5Transactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-800">{tx.invoiceNumber}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                      {tx.paymentMethod}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {formatDateTime(tx.createdAt)} • Pelanggan: {tx.customerName || 'Umum'} • Kasir: {tx.cashierName}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-teal-700 text-sm">{formatRupiah(tx.finalAmount)}</div>
                  <div className="text-[10px] text-slate-400">{tx.items.length} item</div>
                </div>
              </div>
            ))}

            {/* Tombol Lihat Selengkapnya di bawah list */}
            <div className="pt-2 text-center">
              <button
                onClick={() => onNavigateTab('transactions')}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Lihat Selengkapnya (Semua Riwayat Transaksi) →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Section: Barang Stok Menipis */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Barang Stok Menipis & Habis</h3>
              <p className="text-[11px] text-slate-400">Daftar produk yang perlu segera di-restock</p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('products')}
            className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
          >
            <span>Semua Produk</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {metrics.lowStockProducts.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Semua stok aman, tidak ada stok yang menipis atau habis</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {metrics.lowStockProducts.map((p) => {
              const isOut = p.stock <= 0;
              return (
                <div key={p.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">{p.name}</div>
                    <div className="text-[11px] text-slate-400">
                      Kategori: {p.category} • Harga: {formatRupiah(p.price)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${
                        isOut ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isOut ? 'Habis (0)' : `Sisa ${p.stock} ${p.unit || 'pcs'}`}
                    </span>

                    <button
                      onClick={() => {
                        setAdjustingStockProduct(p);
                        setQuickDelta(10);
                      }}
                      className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold rounded-lg text-xs transition"
                    >
                      + Restock
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Section: Hutang Pelanggan (Kas Bon) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 text-rose-700 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Hutang Pelanggan (Kas Bon)</h3>
              <p className="text-[11px] text-slate-400">Catatan piutang dan pembayaran pelanggan</p>
            </div>
          </div>

          <button
            onClick={() => setIsAddDebtOpen(true)}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Hutang Baru</span>
          </button>
        </div>

        {metrics.unpaidDebts.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Tidak ada hutang pelanggan yang tercatat (semua lunas)</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {metrics.unpaidDebts.map((d) => (
              <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">{d.customerName}</span>
                    {d.customerPhone && (
                      <span className="text-[11px] text-slate-400 font-mono">({d.customerPhone})</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{d.description || 'Hutang belanja'}</p>
                  {d.dueDate && (
                    <p className="text-[10px] text-rose-600 font-medium">Jatuh Tempo: {d.dueDate}</p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="text-right">
                    <div className="font-bold text-rose-600 text-sm">{formatRupiah(d.remainingAmount)}</div>
                    {d.paidAmount > 0 && (
                      <div className="text-[10px] text-slate-400">
                        Total {formatRupiah(d.amount)} • Dicicil {formatRupiah(d.paidAmount)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setPayingDebt(d);
                      setPayAmountInput(d.remainingAmount);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition active:scale-95 shadow-xs"
                  >
                    Bayar / Cicil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. TOMBOL TAMBAH MELAYANG (FLOATING ACTION BUTTON - FAB) - HANYA ICON TAMBAH */}
      <div className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40">
        <button
          onClick={() => onNavigateTab('pos')}
          aria-label="Tambah Transaksi"
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white flex items-center justify-center shadow-2xl shadow-teal-600/50 hover:shadow-teal-600/70 transition-all duration-200 active:scale-90 cursor-pointer ring-4 ring-white/90 group"
          title="Tambah Transaksi Baru"
        >
          <Plus className="w-7 h-7 sm:w-8 sm:h-8 stroke-[3] group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Modal: Tambah Hutang Baru */}
      {isAddDebtOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">Catat Kas Bon / Hutang Pelanggan</h3>
              <button
                onClick={() => setIsAddDebtOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDebt} className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pak Budi"
                  value={debtForm.customerName}
                  onChange={(e) => setDebtForm({ ...debtForm, customerName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">No. WhatsApp / HP</label>
                <input
                  type="text"
                  placeholder="0812-xxxx-xxxx"
                  value={debtForm.customerPhone}
                  onChange={(e) => setDebtForm({ ...debtForm, customerPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Nominal Hutang (Rp) *</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={debtForm.amount}
                  onChange={(e) => setDebtForm({ ...debtForm, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-rose-500 font-bold text-rose-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Keterangan Barang yang Dihutang</label>
                <input
                  type="text"
                  placeholder="Cth: BBM Pertalite 5 Liter & Rokok"
                  value={debtForm.description}
                  onChange={(e) => setDebtForm({ ...debtForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Tanggal Janji Bayar (Jatuh Tempo)</label>
                <input
                  type="date"
                  value={debtForm.dueDate}
                  onChange={(e) => setDebtForm({ ...debtForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-rose-500 text-slate-700"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition"
                >
                  Simpan Hutang
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddDebtOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bayar / Cicil Hutang */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Pembayaran Hutang</h3>
                <p className="text-slate-500">{payingDebt.customerName}</p>
              </div>
              <button
                onClick={() => setPayingDebt(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Sisa Hutang Saat Ini:</span>
                <span className="font-bold text-rose-600 text-sm">
                  {formatRupiah(payingDebt.remainingAmount)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Total Hutang Awal:</span>
                <span>{formatRupiah(payingDebt.amount)}</span>
              </div>
            </div>

            <form onSubmit={handlePayDebtSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Nominal Pembayaran Diterima (Rp) *
                </label>
                <input
                  type="number"
                  min="1000"
                  max={payingDebt.remainingAmount}
                  step="1000"
                  required
                  value={payAmountInput || ''}
                  onChange={(e) => setPayAmountInput(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500 font-bold text-emerald-700 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayAmountInput(payingDebt.remainingAmount)}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-semibold"
                >
                  Bayar Lunas ({formatRupiah(payingDebt.remainingAmount)})
                </button>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition"
                >
                  Konfirmasi Pembayaran
                </button>
                <button
                  type="button"
                  onClick={() => setPayingDebt(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quick Restock */}
      {adjustingStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Restock Barang Cepat</h3>
                <p className="text-slate-500">{adjustingStockProduct.name}</p>
              </div>
              <button
                onClick={() => setAdjustingStockProduct(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Stok Saat Ini:</span>
              <span className="font-bold text-slate-900 text-sm">
                {adjustingStockProduct.stock} {adjustingStockProduct.unit || 'pcs'}
              </span>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Jumlah Tambahan Masuk:
              </label>
              <input
                type="number"
                min="1"
                value={quickDelta}
                onChange={(e) => setQuickDelta(Number(e.target.value))}
                className="w-full text-center font-bold text-base py-2 bg-slate-50 border border-slate-200 rounded-xl text-teal-700"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center">
              {[+5, +10, +20, +50, +100].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setQuickDelta(num)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-teal-100 text-slate-700 rounded-lg text-[11px] font-semibold"
                >
                  +{num}
                </button>
              ))}
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={handleSaveQuickStock}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition"
              >
                Simpan Stok Baru
              </button>
              <button
                onClick={() => setAdjustingStockProduct(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

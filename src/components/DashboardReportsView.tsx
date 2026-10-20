import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  ShoppingBag, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Clock, 
  Plus, 
  Trash2, 
  Coins, 
  CreditCard,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatDateTime, formatDate } from '../utils/formatters';
import { generateDailySalesReportPDF } from '../utils/pdfGenerator';
import { Expense } from '../types';

export const DashboardReportsView: React.FC = () => {
  const { transactions, expenses, addExpense, deleteExpense, settings } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // Date Filter State
  const todayStr = new Date().toISOString().split('T')[0];
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | '7days' | 'month' | 'custom' | 'range'>('today');
  const [customDate, setCustomDate] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  // Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState('Operasional');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Determine active date range / filter
  const { filteredTransactions, filteredExpenses, periodLabel } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    let txList = transactions.filter((t) => t.status === 'completed');
    let expList = expenses;
    let label = 'Hari Ini';

    if (filterPeriod === 'today') {
      const todayString = now.toISOString().split('T')[0];
      txList = txList.filter((t) => t.dateString === todayString);
      expList = expList.filter((e) => e.dateString === todayString);
      label = `Hari Ini (${formatDate(now.toISOString())})`;
    } else if (filterPeriod === 'yesterday') {
      const yDate = new Date(today - oneDayMs);
      const yString = yDate.toISOString().split('T')[0];
      txList = txList.filter((t) => t.dateString === yString);
      expList = expList.filter((e) => e.dateString === yString);
      label = `Kemarin (${formatDate(yDate.toISOString())})`;
    } else if (filterPeriod === '7days') {
      const start7 = today - 6 * oneDayMs;
      txList = txList.filter((t) => new Date(t.createdAt).getTime() >= start7);
      expList = expList.filter((e) => new Date(e.createdAt).getTime() >= start7);
      label = '7 Hari Terakhir';
    } else if (filterPeriod === 'month') {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      txList = txList.filter((t) => new Date(t.createdAt).getTime() >= startMonth);
      expList = expList.filter((e) => new Date(e.createdAt).getTime() >= startMonth);
      label = `Bulan ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`;
    } else if (filterPeriod === 'custom') {
      txList = txList.filter((t) => t.dateString === customDate);
      expList = expList.filter((e) => e.dateString === customDate);
      label = `Tanggal ${formatDate(customDate)}`;
    } else if (filterPeriod === 'range') {
      txList = txList.filter((t) => t.dateString >= startDate && t.dateString <= endDate);
      expList = expList.filter((e) => e.dateString >= startDate && e.dateString <= endDate);
      label = `Rentang: ${formatDate(startDate)} s.d. ${formatDate(endDate)}`;
    }

    return { filteredTransactions: txList, filteredExpenses: expList, periodLabel: label };
  }, [transactions, expenses, filterPeriod, customDate, startDate, endDate]);

  // Financial Metrics Summary
  const summary = useMemo(() => {
    const totalRevenue = filteredTransactions.reduce((acc, t) => acc + t.finalAmount, 0);
    // Khusus layanan yang ada admin fee, laba dihitung HANYA admin-nya saja!
    const grossProfit = filteredTransactions.reduce((acc, t) => {
      if (t.adminFee && t.adminFee > 0) {
        return acc + Math.max(0, t.adminFee - (t.discount || 0));
      }
      return acc + (t.totalProfit !== undefined ? t.totalProfit : (t.finalAmount - (t.totalCost || 0)));
    }, 0);
    const totalCost = totalRevenue - grossProfit;
    const totalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    const transactionCount = filteredTransactions.length;
    const itemsSold = filteredTransactions.reduce(
      (acc, t) => acc + t.items.reduce((sum, item) => sum + item.quantity, 0),
      0
    );
    const aov = transactionCount > 0 ? Math.round(totalRevenue / transactionCount) : 0;

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses,
      netProfit,
      transactionCount,
      itemsSold,
      aov,
    };
  }, [filteredTransactions, filteredExpenses]);

  // Payment Method Breakdown
  const paymentMethodStats = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {
      Tunai: { count: 0, total: 0 },
      QRIS: { count: 0, total: 0 },
      'Transfer Bank': { count: 0, total: 0 },
      Debit: { count: 0, total: 0 },
    };

    filteredTransactions.forEach((t) => {
      const method = t.paymentMethod || 'Tunai';
      if (!map[method]) {
        map[method] = { count: 0, total: 0 };
      }
      map[method].count += 1;
      map[method].total += t.finalAmount;
    });

    return map;
  }, [filteredTransactions]);

  // Top 5 Products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const curr = map.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        curr.qty += item.quantity;
        curr.revenue += item.subtotal;
        map.set(item.productId, curr);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredTransactions]);

  // Dynamic Trend Distribution: By Day if multi-day range, or By Hour if single day
  const trendStats = useMemo(() => {
    const completedTx = filteredTransactions.filter((t) => t.status === 'completed');
    const uniqueDates = Array.from(new Set(completedTx.map((t) => t.dateString).filter(Boolean))).sort();
    const isMultiDay = uniqueDates.length > 1 || filterPeriod === '7days' || filterPeriod === 'month' || filterPeriod === 'range';

    if (isMultiDay && uniqueDates.length > 0) {
      const dateMap = new Map<string, number>();
      uniqueDates.forEach((d) => dateMap.set(d, 0));
      completedTx.forEach((tx) => {
        if (tx.dateString && dateMap.has(tx.dateString)) {
          dateMap.set(tx.dateString, (dateMap.get(tx.dateString) || 0) + tx.finalAmount);
        }
      });

      const maxVal = Math.max(...Array.from(dateMap.values()), 1);
      return {
        type: 'daily' as const,
        title: 'Tren Penjualan Harian (Per Tanggal)',
        subtitle: 'Grafik fluktuasi omzet kasir per hari dalam periode ini',
        data: uniqueDates.map((d) => {
          const parts = d.split('-');
          const day = parts[2];
          const monthNum = parseInt(parts[1], 10) - 1;
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          const amount = dateMap.get(d) || 0;
          return {
            label: `${day} ${monthNames[monthNum] || ''}`,
            amount,
            percentage: Math.round((amount / maxVal) * 100),
          };
        }),
      };
    }

    // Single day: 08:00 to 22:00
    const hours = Array.from({ length: 15 }, (_, i) => i + 8);
    const hourMap = new Map<number, number>();
    hours.forEach((h) => hourMap.set(h, 0));

    completedTx.forEach((tx) => {
      const date = new Date(tx.createdAt);
      const h = date.getHours();
      if (hourMap.has(h)) {
        hourMap.set(h, (hourMap.get(h) || 0) + tx.finalAmount);
      }
    });

    const maxVal = Math.max(...Array.from(hourMap.values()), 1);

    return {
      type: 'hourly' as const,
      title: 'Tren Penjualan Berdasarkan Jam Operasional',
      subtitle: 'Grafik omzet kasir untuk melihat jam sibuk belanja (peak hours)',
      data: hours.map((h) => ({
        label: `${h.toString().padStart(2, '0')}:00`,
        amount: hourMap.get(h) || 0,
        percentage: Math.round(((hourMap.get(h) || 0) / maxVal) * 100),
      })),
    };
  }, [filteredTransactions, filterPeriod]);

  // Handle PDF Export
  const handleExportPDF = async () => {
    await generateDailySalesReportPDF({
      dateLabel: periodLabel,
      transactions: filteredTransactions,
      expenses: filteredExpenses,
      settings,
      summary,
    });
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || expenseAmount <= 0) {
      alert('Isi judul dan nominal pengeluaran dengan benar');
      return;
    }

    const todayDate = new Date().toISOString().split('T')[0];
    await addExpense({
      title: expenseTitle.trim(),
      amount: Number(expenseAmount),
      category: expenseCategory,
      notes: expenseNotes.trim(),
      createdBy: userProfile?.displayName || 'Staf Usaha',
      dateString: filterPeriod === 'custom' ? customDate : todayDate,
    });

    setExpenseTitle('');
    setExpenseAmount(0);
    setExpenseNotes('');
    setIsExpenseModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & PDF Download Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dasbor Laporan Penjualan Harian</h1>
          <p className="text-xs text-slate-500">
            Analisis omzet, laba kotor, beban pengeluaran operasional, dan cetak PDF rekapitulasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs transition active:scale-95 border border-rose-100"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Pengeluaran</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer"
            title="Unduh rekapitulasi laporan lengkap dengan visualisasi grafik tren dan pembayaran"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Laporan PDF (+Grafik)</span>
          </button>
        </div>
      </div>

      {/* Period Filter Buttons */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: 'yesterday', label: 'Kemarin' },
            { id: '7days', label: '7 Hari Terakhir' },
            { id: 'month', label: 'Bulan Ini' },
            { id: 'custom', label: 'Tanggal' },
            { id: 'range', label: 'Rentang Tanggal' },
          ].map((tab) => {
            const isActive = filterPeriod === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterPeriod(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {filterPeriod === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Pilih Tanggal:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}

        {filterPeriod === 'range' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Dari:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium"
            />
            <span className="text-slate-500">s.d.</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium"
            />
          </div>
        )}

        <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
          Periode: <span className="text-slate-800">{periodLabel}</span>
        </div>
      </div>

      {/* High-Impact Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Omzet */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Omzet Penjualan</span>
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900">{formatRupiah(summary.totalRevenue)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.transactionCount} transaksi ({summary.itemsSold} item)
            </p>
          </div>
        </div>

        {/* Laba Bersih */}
        <div className="bg-emerald-900 text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-200">Laba Bersih Estimasi</span>
            <div className="p-2 bg-emerald-800 text-emerald-300 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-white">{formatRupiah(summary.netProfit)}</div>
            <p className="text-[11px] text-emerald-300 mt-0.5">
              Omzet - HPP ({formatRupiah(summary.totalCost)}) - Beban
            </p>
          </div>
        </div>

        {/* Pengeluaran Operasional */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pengeluaran Operasional</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-rose-600">{formatRupiah(summary.totalExpenses)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {filteredExpenses.length} catatan pengeluaran usaha
            </p>
          </div>
        </div>

        {/* Nilai Rata-rata Belanja */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Rata-rata Nilai Belanja (AOV)</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900">{formatRupiah(summary.aov)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Per transaksi belanja kasir</p>
          </div>
        </div>
      </div>

      {/* Middle Row: Hourly Chart & Payment Methods Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dynamic Sales Bar Chart (Daily or Hourly) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>{trendStats.title}</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {trendStats.subtitle}
              </p>
            </div>
          </div>

          <div className="h-44 flex items-end gap-2 pt-6 pb-2 border-b border-slate-100 overflow-x-auto">
            {trendStats.data.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                Belum ada data transaksi pada periode ini
              </div>
            ) : (
              trendStats.data.map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 min-w-[28px] h-full justify-end group">
                  <div className="relative w-full flex justify-center items-end h-full">
                    <div
                      style={{ height: `${Math.max(item.percentage, 4)}%` }}
                      className={`w-full max-w-[22px] rounded-t-md transition-all ${
                        item.amount > 0 ? 'bg-teal-600 group-hover:bg-teal-500' : 'bg-slate-100'
                      }`}
                    />
                    {item.amount > 0 && (
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[9px] py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap z-10 transition">
                        {formatRupiah(item.amount)}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 rotate-45 sm:rotate-0 mt-1 truncate max-w-[40px] text-center">
                    {item.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-teal-600" />
              Metode Pembayaran
            </h3>
            <p className="text-[11px] text-slate-400">Distribusi nominal transaksi per channel</p>
          </div>

          <div className="space-y-3 pt-1">
            {Object.entries(paymentMethodStats).map(([method, data]) => {
              const percent = summary.totalRevenue > 0 ? Math.round((data.total / summary.totalRevenue) * 100) : 0;
              return (
                <div key={method} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700">{method}</span>
                    <span className="text-slate-900 font-bold">
                      {formatRupiah(data.total)}{' '}
                      <span className="text-[11px] font-normal text-slate-400">({percent}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className="bg-teal-600 h-full rounded-full transition-all"
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">{data.count} transaksi</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Products & Expenses Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-teal-600" />
            Produk Paling Laris (Top 5)
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Belum ada data transaksi pada periode ini</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {topProducts.map((p, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{p.qty} item terjual</div>
                    </div>
                  </div>
                  <div className="font-bold text-teal-700">{formatRupiah(p.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses List */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-rose-600" />
              Beban Pengeluaran Usaha
            </h3>
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="text-xs text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Catat Beban
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Tidak ada catatan pengeluaran pada periode ini</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto pr-1">
              {filteredExpenses.map((e) => (
                <div key={e.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">{e.title}</div>
                    <div className="text-[10px] text-slate-400">
                      {e.category} • {formatDateTime(e.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-rose-600">{formatRupiah(e.amount)}</span>
                    {isAdmin && (
                      <button
                        onClick={() => deleteExpense(e.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Record Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">Catat Pengeluaran Usaha</h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Nama Keperluan / Pengeluaran *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beli Es Batu & Cup Plastik"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  placeholder="0"
                  value={expenseAmount || ''}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold text-rose-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Kategori Pengeluaran</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                >
                  <option value="Operasional">Bahan Baku & Operasional</option>
                  <option value="Listrik & Air">Listrik, Gas & Air</option>
                  <option value="Sewa Tempat">Sewa Tempat</option>
                  <option value="Gaji & Upah">Gaji & Upah Harian</option>
                  <option value="Lainnya">Lain-lain</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  placeholder="Opsional (cth: nomor nota / keterangan)"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition"
                >
                  Simpan Pengeluaran
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

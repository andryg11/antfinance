import React, { useState, useMemo } from 'react';
import { 
  ReceiptText, 
  Search, 
  Calendar, 
  Printer, 
  XCircle, 
  CheckCircle2, 
  ChevronRight, 
  Eye, 
  RotateCcw,
  User,
  CreditCard,
  X
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Transaction } from '../types';
import { formatRupiah, formatDateTime } from '../utils/formatters';
import { ReceiptModal } from './ReceiptModal';

export const TransactionsView: React.FC = () => {
  const { transactions, cancelTransaction, settings } = useData();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  // Detail Modal & Receipt
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch =
        tx.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tx.cashierName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDate = !selectedDate || tx.dateString === selectedDate;
      const matchStatus = statusFilter === 'all' || tx.status === statusFilter;

      return matchSearch && matchDate && matchStatus;
    });
  }, [transactions, searchQuery, selectedDate, statusFilter]);

  const handleCancelTx = async (tx: Transaction) => {
    if (!isAdmin) return;
    await cancelTransaction(tx.id);
    setSelectedTx(null);
  };

  const handleReprintReceipt = (tx: Transaction) => {
    setReceiptTx(tx);
    setIsReceiptOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Riwayat Transaksi Penjualan</h1>
        <p className="text-xs text-slate-500">
          Daftar seluruh nota penjualan toko secara realtime dari Firestore.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari no. invoice, pelanggan, atau nama kasir..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </div>

          <div className="flex gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-700 focus:ring-1 focus:ring-teal-500"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 bg-slate-100 rounded-xl"
              >
                Reset Tgl
              </button>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-700 focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">Semua Status</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table / List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <ReceiptText className="w-10 h-10 mx-auto stroke-1" />
            <p className="text-sm font-medium text-slate-600">Tidak ada riwayat transaksi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">No. Nota</th>
                  <th className="px-4 py-3">Waktu Transaksi</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3">Kasir</th>
                  <th className="px-4 py-3">Total Belanja</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => {
                  const isCancelled = tx.status === 'cancelled';
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-slate-50/70 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {tx.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(tx.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {tx.customerName || 'Pelanggan Umum'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {tx.cashierName}
                      </td>
                      <td className="px-4 py-3 font-bold text-teal-700">
                        {formatRupiah(tx.finalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                            isCancelled
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isCancelled ? (
                            <>
                              <XCircle className="w-3 h-3" /> Dibatalkan
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Selesai
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleReprintReceipt(tx)}
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                            title="Cetak Struk"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                            title="Detail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-auto animate-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Rincian Transaksi</h3>
                <p className="text-[11px] text-slate-400 font-mono">{selectedTx.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Status and Meta */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span
                    className={`font-bold ${
                      selectedTx.status === 'cancelled' ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {selectedTx.status === 'cancelled' ? 'DIBATALKAN' : 'SELESAI'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Waktu:</span>
                  <span>{formatDateTime(selectedTx.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kasir:</span>
                  <span>{selectedTx.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pelanggan:</span>
                  <span>{selectedTx.customerName || 'Umum'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Metode Bayar:</span>
                  <span className="font-semibold uppercase">{selectedTx.paymentMethod}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-700">Daftar Item ({selectedTx.items.length})</h4>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                  {selectedTx.items.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-slate-800">{item.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.quantity} x {formatRupiah(item.price)}
                        </div>
                      </div>
                      <div className="font-bold text-slate-800">{formatRupiah(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-100 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>{formatRupiah(selectedTx.totalAmount)}</span>
                </div>
                {selectedTx.adminFee && selectedTx.adminFee > 0 ? (
                  <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-lg">
                    <span>Biaya Admin (Laba Layanan):</span>
                    <span>+{formatRupiah(selectedTx.adminFee)}</span>
                  </div>
                ) : null}
                {selectedTx.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon:</span>
                    <span>-{formatRupiah(selectedTx.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-teal-900 text-sm pt-1 border-t border-teal-200">
                  <span>Total Tagihan:</span>
                  <span>{formatRupiah(selectedTx.finalAmount)}</span>
                </div>
                {selectedTx.paymentMethod === 'Tunai' && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Diterima:</span>
                      <span>{formatRupiah(selectedTx.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-slate-800">
                      <span>Kembalian:</span>
                      <span>{formatRupiah(selectedTx.change)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    handleReprintReceipt(selectedTx);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Struk</span>
                </button>

                {isAdmin && selectedTx.status !== 'cancelled' && (
                  <button
                    onClick={() => handleCancelTx(selectedTx)}
                    className="flex items-center justify-center gap-1 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl transition"
                    title="Batalkan & Kembalikan Stok"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Batalkan Nota</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {isReceiptOpen && receiptTx && (
        <ReceiptModal
          transaction={receiptTx}
          settings={settings}
          onClose={() => {
            setIsReceiptOpen(false);
            setReceiptTx(null);
          }}
        />
      )}
    </div>
  );
};

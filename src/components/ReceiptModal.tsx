import React, { useRef } from 'react';
import { Printer, X, CheckCircle, Share2 } from 'lucide-react';
import { Transaction, BusinessSettings } from '../types';
import { formatRupiah, formatDateTime } from '../utils/formatters';

interface ReceiptModalProps {
  transaction: Transaction | null;
  settings: BusinessSettings;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  settings,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Top Action Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between no-print">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="font-semibold text-sm">Transaksi Berhasil</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div 
          ref={receiptRef}
          className="p-6 bg-white font-mono text-xs text-slate-800 space-y-3 print:p-0 print:m-0 print:w-full"
          id="printable-receipt"
        >
          {/* Header */}
          <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden mx-auto mb-1 border border-slate-200">
              <img src="/logo.jpg" alt="Logo CatatUsaha" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-base font-bold tracking-wider uppercase text-slate-900 font-sans">
              {settings.businessName || 'CATAT USAHA'}
            </h2>
            {settings.tagline && (
              <p className="text-[11px] text-slate-500 font-sans">{settings.tagline}</p>
            )}
            <p className="text-[11px] text-slate-600 font-sans">{settings.address}</p>
            <p className="text-[11px] text-slate-600 font-sans">Telp: {settings.phone}</p>
          </div>

          {/* Invoice Meta */}
          <div className="text-[11px] space-y-1 border-b border-dashed border-slate-300 pb-2">
            <div className="flex justify-between">
              <span className="text-slate-500">No. Nota:</span>
              <span className="font-semibold">{transaction.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Waktu:</span>
              <span>{formatDateTime(transaction.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Kasir:</span>
              <span>{transaction.cashierName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pelanggan:</span>
              <span>{transaction.customerName || 'Umum'}</span>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2 border-b border-dashed border-slate-300 pb-2">
            {transaction.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="font-semibold text-slate-800">{item.name}</div>
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>
                    {item.quantity} x {formatRupiah(item.price)}
                  </span>
                  <span className="font-medium text-slate-900">{formatRupiah(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Calculation */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>{formatRupiah(transaction.totalAmount)}</span>
            </div>
            {transaction.discount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Diskon:</span>
                <span>-{formatRupiah(transaction.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
              <span>TOTAL:</span>
              <span className="text-emerald-700">{formatRupiah(transaction.finalAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600 pt-1">
              <span>Metode Bayar:</span>
              <span className="font-medium text-slate-800 uppercase">{transaction.paymentMethod}</span>
            </div>
            {transaction.adminFee && transaction.adminFee > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>Biaya Admin:</span>
                <span>{formatRupiah(transaction.adminFee)}</span>
              </div>
            ) : null}
            {transaction.amountPaid < transaction.finalAmount ? (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Dibayar (DP):</span>
                  <span>{formatRupiah(transaction.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-rose-600">
                  <span>Sisa Hutang:</span>
                  <span>{formatRupiah(transaction.finalAmount - transaction.amountPaid)}</span>
                </div>
                <div className="p-1.5 bg-rose-50 text-rose-800 text-[10px] rounded font-semibold text-center mt-1">
                  STATUS: {transaction.amountPaid === 0 ? 'UTANG FULL (BELUM BAYAR)' : 'BAYAR SEBAGIAN (BELUM LUNAS)'}
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Uang Diterima:</span>
                  <span>{formatRupiah(transaction.amountPaid + (transaction.change || 0))}</span>
                </div>
                {transaction.change > 0 && (
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Kembalian:</span>
                    <span>{formatRupiah(transaction.change)}</span>
                  </div>
                )}
                <div className="p-1.5 bg-emerald-50 text-emerald-800 text-[10px] rounded font-semibold text-center mt-1">
                  STATUS: LUNAS
                </div>
              </>
            )}
            {transaction.notes && (
              <div className="pt-1 text-[10px] text-slate-500 border-t border-slate-100">
                <span className="font-semibold text-slate-600">Catatan:</span> {transaction.notes}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="text-center pt-2 space-y-1">
            <p className="text-[10px] text-slate-500 font-sans italic">
              {settings.receiptFooter || 'Terima kasih atas kunjungan Anda!'}
            </p>
            <div className="pt-2 flex justify-center items-center">
              <div className="text-[9px] tracking-widest text-slate-400 uppercase">
                *** CATAT USAHA POS ***
              </div>
            </div>
          </div>
        </div>

        {/* Buttons (Hidden when printing) */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-sm transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Struk</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-xl text-sm transition"
          >
            Selesai / Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  Barcode as BarcodeIcon, 
  Tag, 
  Store,
  Grid,
  FileText
} from 'lucide-react';
import { Product } from '../types';
import { useData } from '../context/DataContext';
import { formatRupiah } from '../utils/formatters';
import { Barcode1D } from './Barcode1D';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const { settings } = useData();
  const [printCopies, setPrintCopies] = useState<number>(4);
  const [printFormat, setPrintFormat] = useState<'a4_grid' | 'thermal'>('a4_grid');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !product) return null;

  const barcodeValue = (product.sku && product.sku.trim()) || product.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(barcodeValue);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadPng = () => {
    // Cari elemen svg barcode
    const svgElem = document.querySelector('#barcode-preview-container svg') as SVGSVGElement | null;
    if (!svgElem) return;

    try {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgElem);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = img.width * 2 || 600;
        canvas.height = img.height * 2 || 250;
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `barcode-${barcodeValue}.png`;
          downloadLink.href = pngUrl;
          downloadLink.click();
          URL.revokeObjectURL(blobURL);
        }
      };
      img.src = blobURL;
    } catch (err) {
      console.warn('Download PNG error:', err);
    }
  };

  const handlePrint = () => {
    const printArea = printContainerRef.current;
    if (!printArea) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Izinkan pop-up untuk mencetak label barcode.');
      return;
    }

    const labelsHtml = printArea.innerHTML;
    const isThermal = printFormat === 'thermal';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Label Barcode - ${product.name}</title>
          <style>
            @page {
              size: ${isThermal ? '58mm auto' : 'A4'};
              margin: ${isThermal ? '2mm' : '8mm'};
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-grid {
              display: grid;
              grid-template-columns: ${isThermal ? '1fr' : 'repeat(3, 1fr)'};
              gap: 8px;
              padding: 4px;
            }
            .barcode-card {
              border: 1px dashed #bbb;
              padding: 8px 10px;
              text-align: center;
              border-radius: 6px;
              page-break-inside: avoid;
              background: #fff;
            }
            .store-name {
              font-size: 10px;
              font-weight: 700;
              color: #444;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .product-name {
              font-size: 12px;
              font-weight: 800;
              margin: 2px 0 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .product-price {
              font-size: 14px;
              font-weight: 900;
              color: #000;
              margin-top: 2px;
            }
            svg {
              max-width: 100%;
              height: 48px;
              display: block;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          <div class="print-grid">
            ${labelsHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Barcode Batang & Label Produk
              </h3>
              <p className="text-[11px] text-slate-500">
                Kode garis linear standar 1D (Code-128 / EAN-13)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Preview Kartu Barcode Batang Utama */}
          <div 
            id="barcode-preview-container"
            className="p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-xs flex flex-col items-center text-center space-y-2 relative group hover:border-teal-400 transition"
          >
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <Store className="w-3.5 h-3.5 text-teal-600" />
              <span>{settings.businessName || 'Toko Saya'}</span>
            </div>

            <h4 className="font-black text-slate-900 text-base sm:text-lg leading-tight px-2">
              {product.name}
            </h4>

            {/* Rendering Gambar Barcode Batang Asli */}
            <div className="py-2 px-3 bg-white rounded-xl flex items-center justify-center w-full overflow-hidden">
              <Barcode1D
                value={barcodeValue}
                width={2.0}
                height={60}
                fontSize={13}
                displayValue={true}
              />
            </div>

            <div className="font-black text-teal-700 text-lg sm:text-xl">
              {formatRupiah(product.price)}
            </div>

            <div className="flex items-center gap-2 pt-1 text-[11px]">
              <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono font-semibold">
                SKU: {barcodeValue}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Salin Angka Barcode"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-500" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Opsi Cetak Stiker / Label Barcode */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-teal-600" />
                <span>Pengaturan Cetak Label Stiker:</span>
              </span>
            </div>

            {/* Pilihan Jumlah Label */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Jumlah Label yang Ingin Dicetak:
              </label>
              <div className="grid grid-cols-5 gap-1.5 text-xs font-bold">
                {[1, 4, 8, 12, 24].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setPrintCopies(qty)}
                    className={`py-2 rounded-xl border text-center transition cursor-pointer ${
                      printCopies === qty
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {qty} pcs
                  </button>
                ))}
              </div>
            </div>

            {/* Pilihan Format Kertas */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Format Kertas:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPrintFormat('a4_grid')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer ${
                    printFormat === 'a4_grid'
                      ? 'bg-teal-50 text-teal-800 border-teal-500 ring-1 ring-teal-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Grid className="w-4 h-4 text-teal-600" />
                  <span>Stiker Lembaran A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintFormat('thermal')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer ${
                    printFormat === 'thermal'
                      ? 'bg-teal-50 text-teal-800 border-teal-500 ring-1 ring-teal-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>Printer Thermal Kasir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hidden Container untuk Template Cetak Multiple Labels */}
          <div ref={printContainerRef} className="hidden">
            {Array.from({ length: printCopies }).map((_, index) => (
              <div key={index} className="barcode-card">
                <div className="store-name">{settings.businessName || 'TOKO SAYA'}</div>
                <div className="product-name">{product.name}</div>
                <Barcode1D
                  value={barcodeValue}
                  width={1.6}
                  height={42}
                  fontSize={11}
                  displayValue={true}
                />
                <div className="product-price">{formatRupiah(product.price)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer / Action Buttons */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak {printCopies} Label Barcode</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            className="py-3 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            title="Unduh file gambar barcode untuk dicetak atau disimpan"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Unduh PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};

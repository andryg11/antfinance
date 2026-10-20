import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Camera, 
  QrCode, 
  Sparkles, 
  ScanLine, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  Loader2, 
  Wifi, 
  Zap, 
  PackageCheck,
  Search,
  Maximize2,
  SwitchCamera
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product } from '../types';
import { formatRupiah } from '../utils/formatters';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onApplySearchQuery: (query: string) => void;
}

interface AiScanResult {
  provider: string;
  quota: string;
  quotaGigabytes?: number;
  validityDays?: string;
  productName?: string;
  searchKeyword?: string;
  detectedText?: string;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onApplySearchQuery,
}) => {
  const [activeTab, setActiveTab] = useState<'ai_vision' | 'qr_barcode'>('ai_vision');

  // AI Vision states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiScanResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);

  // QR / Barcode states
  const [isQrScanning, setIsQrScanning] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [barcodeMatchedProduct, setBarcodeMatchedProduct] = useState<Product | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const directCameraInputRef = useRef<HTMLInputElement>(null);
  const qrReaderRef = useRef<Html5Qrcode | null>(null);

  // Play audio confirmation beep
  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch {
      // Audio might fail if blocked by browser policy
    }
  };

  // Reset when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      stopQrScanner();
      setImagePreview(null);
      setAiResult(null);
      setAiError(null);
      setMatchedProducts([]);
      setScannedCode(null);
      setBarcodeMatchedProduct(null);
    }
  }, [isOpen]);

  // Start QR scanner when tab switches to qr_barcode
  useEffect(() => {
    if (isOpen && activeTab === 'qr_barcode') {
      startQrScanner();
    } else {
      stopQrScanner();
    }
    return () => {
      stopQrScanner();
    };
  }, [isOpen, activeTab]);

  // Stop QR scanner safely
  const stopQrScanner = async () => {
    if (qrReaderRef.current) {
      try {
        if (qrReaderRef.current.isScanning) {
          await qrReaderRef.current.stop();
        }
        await qrReaderRef.current.clear();
      } catch (err) {
        console.error('Error stopping QR scanner:', err);
      }
      qrReaderRef.current = null;
      setIsQrScanning(false);
    }
  };

  // Start QR scanner using Html5Qrcode
  const startQrScanner = async () => {
    setQrError(null);
    setScannedCode(null);
    setBarcodeMatchedProduct(null);

    // Give DOM time to render reader div
    setTimeout(async () => {
      const element = document.getElementById('qr-reader-container');
      if (!element) return;

      try {
        if (qrReaderRef.current) {
          await stopQrScanner();
        }

        const html5QrCode = new Html5Qrcode('qr-reader-container');
        qrReaderRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleBarcodeScanned(decodedText);
          },
          () => {
            // ignore scan frame errors
          }
        );
        setIsQrScanning(true);
      } catch (err: any) {
        console.error('Failed to start camera for QR:', err);
        setIsQrScanning(false);
        setQrError(
          err?.name === 'NotAllowedError'
            ? 'Izin akses kamera ditolak. Berikan izin kamera di pengaturan browser hp Anda atau unggah foto barcode.'
            : 'Kamera tidak dapat diakses atau sedang digunakan oleh aplikasi lain. Anda juga bisa mengunggah gambar kode.'
        );
      }
    }, 200);
  };

  // Handle scanned QR / Barcode
  const handleBarcodeScanned = (code: string) => {
    if (!code) return;
    playBeep();
    setScannedCode(code);

    // Stop scanner once detected
    stopQrScanner();

    // Match with products in Data Master (by SKU, ID, or Barcode in name)
    const normalizedCode = code.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === normalizedCode) ||
        p.id.toLowerCase() === normalizedCode ||
        p.name.toLowerCase().includes(normalizedCode)
    );

    if (matched) {
      setBarcodeMatchedProduct(matched);
    } else {
      setBarcodeMatchedProduct(null);
    }
  };

  // Handle File or Camera Capture for AI Vision
  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiError(null);
    setAiResult(null);
    setMatchedProducts([]);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      setImagePreview(base64Data);
      await analyzeVoucherWithAi(base64Data, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be reselected
    e.target.value = '';
  };

  // Call Server-side Gemini API for Voucher & Kuota Analysis
  const analyzeVoucherWithAi = async (base64Image: string, mimeType: string) => {
    setIsAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch('/api/gemini/scan-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Image,
          mimeType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server merespon status ${res.status}`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error('Hasil deteksi AI tidak valid');
      }

      const data: AiScanResult = json.data;
      setAiResult(data);
      playBeep();

      // Find matching products in Data Master
      findMatchingProducts(data);
    } catch (err: any) {
      console.error('Scan voucher error:', err);
      setAiError(
        err.message || 'Gagal memproses gambar voucher. Pastikan foto jelas dan coba lagi.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  // Match AI result against products in Data Master
  const findMatchingProducts = (data: AiScanResult) => {
    const providerTerm = (data.provider || '').toLowerCase().trim();
    const quotaTerm = (data.quota || '').toLowerCase().trim(); // e.g. "10 gb"
    const gigabytes = data.quotaGigabytes;

    // Search rules:
    // 1. Matches quota (e.g. "10 gb" or "10gb") AND provider (e.g. "telkomsel" / "indosat")
    // 2. Or matches quota number in product name
    const matches = products.filter((p) => {
      const pName = p.name.toLowerCase();
      const pCat = p.category.toLowerCase();
      const pSku = (p.sku || '').toLowerCase();

      // Check if product mentions the provider
      const hasProvider =
        providerTerm &&
        (pName.includes(providerTerm) ||
          pCat.includes(providerTerm) ||
          pSku.includes(providerTerm) ||
          (providerTerm.includes('indosat') && (pName.includes('im3') || pCat.includes('im3'))) ||
          (providerTerm.includes('telkomsel') && (pName.includes('tsel') || pName.includes('simpati'))));

      // Check if product mentions the quota (e.g. "10 gb", "10gb", or "10 giga")
      const rawQuotaNoSpace = quotaTerm.replace(/\s+/g, '');
      const hasQuota =
        (quotaTerm && (pName.includes(quotaTerm) || pName.includes(rawQuotaNoSpace))) ||
        (gigabytes && (pName.includes(`${gigabytes}gb`) || pName.includes(`${gigabytes} gb`)));

      if (hasProvider && hasQuota) return true;
      if (hasQuota) return true;
      if (hasProvider && data.productName && pName.includes(data.productName.toLowerCase())) return true;
      return false;
    });

    setMatchedProducts(matches);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto border border-slate-100 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <ScanLine className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100">Scan Kasir Cerdas</h2>
              <p className="text-[11px] text-slate-400">
                AI Vision Voucher Kuota & Scan Barcode / QR Code
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ai_vision')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 transition ${
              activeTab === 'ai_vision'
                ? 'bg-white text-teal-700 border-b-2 border-teal-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>AI Vision (Voucher / Kuota GB)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('qr_barcode')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 transition ${
              activeTab === 'qr_barcode'
                ? 'bg-white text-teal-700 border-b-2 border-teal-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>Barcode & QR Code</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">

          {/* =================================================================== */}
          {/* TAB 1: AI VISION SCANNER (VOUCHER / KARTU PERDANA / DETEKSI GB)     */}
          {/* =================================================================== */}
          {activeTab === 'ai_vision' && (
            <div className="space-y-4">
              {/* Instructions banner */}
              <div className="bg-teal-50/80 border border-teal-200/60 rounded-2xl p-3.5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="text-xs text-teal-900 leading-relaxed">
                  <span className="font-bold">Scan Voucher Kuota Otomatis:</span> Arahkan kamera hp ke voucher kuota internet atau kartu perdana. AI Vision akan otomatis membaca <span className="font-bold underline">berapa Gigabyte (GB)</span> dan nama provider operatornya.
                </div>
              </div>

              {/* Hidden file inputs: one for native camera, one for gallery file */}
              <input
                ref={directCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageCapture}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageCapture}
                className="hidden"
              />

              {/* Camera Trigger Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => directCameraInputRef.current?.click()}
                  className="py-3 px-3 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Buka Kamera HP</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-3 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Pilih dari Galeri</span>
                </button>
              </div>

              {/* Image Preview & Loading Indicator */}
              {imagePreview && (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-16/10 flex items-center justify-center shadow-inner">
                  <img
                    src={imagePreview}
                    alt="Pratinjau Voucher"
                    className="w-full h-full object-contain"
                  />

                  {/* AI Scanning Animation overlay */}
                  {isAiLoading && (
                    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center text-white">
                      <div className="relative w-14 h-14 mb-3">
                        <Loader2 className="w-14 h-14 animate-spin text-teal-400" />
                        <Sparkles className="w-6 h-6 text-amber-300 absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <p className="font-bold text-sm">Menganalisis Voucher dengan AI Vision...</p>
                      <p className="text-xs text-slate-300 mt-1 max-w-xs">
                        Membaca besaran kuota (GB), provider operator, dan masa aktif...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* AI Error */}
              {aiError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <div className="font-bold">Gagal Menganalisis Gambar</div>
                    <div className="mt-0.5">{aiError}</div>
                  </div>
                </div>
              )}

              {/* AI Result Card */}
              {aiResult && !isAiLoading && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in zoom-in-95">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Hasil Deteksi AI Vision
                    </span>
                    <button
                      type="button"
                      onClick={() => directCameraInputRef.current?.click()}
                      className="text-xs text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Foto Ulang</span>
                    </button>
                  </div>

                  {/* Main highlighted quota badge */}
                  <div className="bg-white p-3.5 rounded-xl border border-teal-100 shadow-xs flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Kuota Terdeteksi</div>
                      <div className="text-2xl font-black text-teal-700 tracking-tight flex items-baseline gap-1">
                        {aiResult.quota || 'Tidak terbaca'}
                      </div>
                      <div className="text-xs text-slate-600 font-bold mt-0.5">
                        {aiResult.provider} {aiResult.productName ? `• ${aiResult.productName}` : ''}
                      </div>
                    </div>

                    <div className="text-right">
                      {aiResult.validityDays && (
                        <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200/50 mb-1">
                          Aktif {aiResult.validityDays}
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {aiResult.detectedText ? `Detail: ${aiResult.detectedText.slice(0, 40)}...` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Search query button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const term = aiResult.searchKeyword || `${aiResult.provider} ${aiResult.quota}`.trim();
                        onApplySearchQuery(term);
                        onClose();
                      }}
                      className="flex-1 py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition border border-teal-200"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Cari "{aiResult.searchKeyword || `${aiResult.provider} ${aiResult.quota}`}" di Kasir</span>
                    </button>
                  </div>

                  {/* Matched products from Data Master */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        Produk Cocok di Data Master ({matchedProducts.length})
                      </span>
                    </div>

                    {matchedProducts.length === 0 ? (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div>
                          Belum ada produk di Data Master yang cocok dengan "{aiResult.quota}". Anda dapat menggunakan tombol "Cari di Kasir" di atas atau meminta Admin mendaftarkan produk ini di Data Master.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {matchedProducts.map((prod) => (
                          <div
                            key={prod.id}
                            className="bg-white p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 transition flex items-center justify-between gap-3 shadow-xs"
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-800">{prod.name}</div>
                              <div className="text-[11px] text-slate-400">
                                {prod.category} • Stok: {prod.stock} {prod.unit}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="font-extrabold text-xs text-teal-800">
                                {formatRupiah(prod.price)}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectProduct(prod);
                                  onClose();
                                }}
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>Pilih</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =================================================================== */}
          {/* TAB 2: QR CODE & BARCODE SCANNER                                   */}
          {/* =================================================================== */}
          {activeTab === 'qr_barcode' && (
            <div className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-200/60 rounded-2xl p-3.5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-4 h-4" />
                </div>
                <div className="text-xs text-blue-900 leading-relaxed">
                  <span className="font-bold">Scan Barcode / QR Code:</span> Arahkan kamera ke barcode fisik barang atau kode QR yang sudah terdaftar di SKU Data Master. Produk akan otomatis terpilih.
                </div>
              </div>

              {/* Viewfinder container */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[320px] mx-auto flex items-center justify-center shadow-md">
                <div id="qr-reader-container" className="w-full h-full" />

                {/* Laser animation overlay if scanning */}
                {isQrScanning && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center">
                    <div className="w-48 h-48 border-2 border-teal-400/80 rounded-2xl relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-teal-400" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-teal-400" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-2 border-b-2 border-teal-400" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-2 border-b-2 border-teal-400" />
                      {/* Laser red scan line */}
                      <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_red] animate-bounce mt-24" />
                    </div>
                  </div>
                )}
              </div>

              {/* Scanner error */}
              {qrError && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <div className="font-bold">Kendala Kamera</div>
                    <div className="mt-0.5">{qrError}</div>
                    <button
                      type="button"
                      onClick={startQrScanner}
                      className="mt-2 text-xs font-bold text-teal-700 underline"
                    >
                      Coba Buka Kamera Lagi
                    </button>
                  </div>
                </div>
              )}

              {/* Scanned code result */}
              {scannedCode && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Kode Terbaca
                    </span>
                    <button
                      type="button"
                      onClick={startQrScanner}
                      className="text-xs text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Scan Lagi</span>
                    </button>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 font-mono text-sm font-bold text-slate-800 text-center select-all">
                    {scannedCode}
                  </div>

                  {barcodeMatchedProduct ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] text-emerald-600 font-bold uppercase">Produk Ditemukan!</div>
                        <div className="text-sm font-extrabold text-slate-800">
                          {barcodeMatchedProduct.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          SKU: {barcodeMatchedProduct.sku || '-'} • Stok: {barcodeMatchedProduct.stock} {barcodeMatchedProduct.unit}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-extrabold text-emerald-700 mb-1">
                          {formatRupiah(barcodeMatchedProduct.price)}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProduct(barcodeMatchedProduct);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                        >
                          Pilih Produk
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div>
                          Kode <b>"{scannedCode}"</b> belum terdaftar di Data Master (SKU atau Nama Barang). Pastikan produk sudah diinput di menu Data Master oleh Admin.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onApplySearchQuery(scannedCode);
                          onClose();
                        }}
                        className="w-full py-2 bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs transition"
                      >
                        Gunakan Kode Sebagai Kata Kunci Pencarian
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Kamera siap digunakan langsung dari HP</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};

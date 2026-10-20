import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  PackageCheck,
  Search,
  SwitchCamera,
  Layers
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product } from '../types';
import { formatRupiah } from '../utils/formatters';
import { useData } from '../context/DataContext';
import { GoogleGenAI } from '@google/genai';

export interface ScannedVoucherData {
  name: string;
  category: string;
  sku?: string;
  quota?: string;
  quotaGigabytes?: number;
  provider?: string;
  validityDays?: string;
  handwrittenNote?: string;
  suggestedCost?: number;
  suggestedPrice?: number;
  imageUrl?: string;
  isCloudinaryUploaded?: boolean;
}

export interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct?: (product: Product) => void;
  onApplySearchQuery?: (query: string) => void;
  onScannedBarcode?: (code: string) => void;
  onScannedVoucherInfo?: (info: ScannedVoucherData) => void;
  title?: string;
  subtitle?: string;
  sourceContext?: 'pos' | 'master_search' | 'master_form';
  defaultTab?: 'ai_vision' | 'qr_barcode';
}

interface AiScanResult {
  provider: string;
  quota: string;
  quotaGigabytes?: number;
  validityDays?: string;
  handwrittenNote?: string;
  productName?: string;
  searchKeyword?: string;
  suggestedCost?: number;
  suggestedPrice?: number;
  detectedText?: string;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onApplySearchQuery,
  onScannedBarcode,
  onScannedVoucherInfo,
  title,
  subtitle,
  sourceContext = 'pos',
  defaultTab,
}) => {
  const { settings } = useData();
  const [activeTab, setActiveTab] = useState<'ai_vision' | 'qr_barcode'>(
    defaultTab || (sourceContext === 'master_form' ? 'qr_barcode' : 'ai_vision')
  );

  // Tab sync
  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      } else if (sourceContext === 'master_form') {
        setActiveTab('qr_barcode');
      }
    }
  }, [isOpen, defaultTab, sourceContext]);

  // AI Vision states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiScanResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);

  // Live Camera stream states for AI Vision (direct in-app feed, NO "Gunakan foto" confirmation)
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [liveCameraError, setLiveCameraError] = useState<string | null>(null);

  // QR / Barcode states
  const [isQrScanning, setIsQrScanning] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [barcodeMatchedProduct, setBarcodeMatchedProduct] = useState<Product | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallbackCameraInputRef = useRef<HTMLInputElement>(null);
  const qrReaderRef = useRef<Html5Qrcode | null>(null);

  // Audio confirmation beep
  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(920, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {
      // Audio might fail if blocked by browser policy
    }
  };

  // Helper to stop live AI camera stream cleanly
  const stopLiveCamera = useCallback(() => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      liveStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraActive(false);
  }, []);

  // Helper to start in-app live camera stream for AI Vision
  const startLiveCamera = useCallback(async (facing: 'environment' | 'user' = cameraFacing) => {
    stopLiveCamera();
    setLiveCameraError(null);

    // Short delay to let DOM render video element
    setTimeout(async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Kamera tidak didukung oleh browser ini.');
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        liveStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch((playErr) => {
            console.warn('Video play caught:', playErr);
          });
        }
        setIsLiveCameraActive(true);
      } catch (err: any) {
        console.warn('Failed to start in-app camera:', err);
        setIsLiveCameraActive(false);
        setLiveCameraError(
          err?.name === 'NotAllowedError'
            ? 'Izin akses kamera ditolak. Berikan izin di browser Anda atau gunakan tombol unggah/file di bawah.'
            : 'Kamera tidak dapat diakses langsung. Anda bisa menggunakan tombol buka kamera sistem atau galeri di bawah.'
        );
      }
    }, 150);
  }, [cameraFacing, stopLiveCamera]);

  // Toggle front/back camera
  const handleToggleCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (!imagePreview) {
      startLiveCamera(nextFacing);
    }
  };

  // Stop QR scanner safely
  const stopQrScanner = useCallback(async () => {
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
  }, []);

  // Start QR scanner using Html5Qrcode
  const startQrScanner = useCallback(async () => {
    setQrError(null);
    setScannedCode(null);
    setBarcodeMatchedProduct(null);

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
          () => {}
        );
        setIsQrScanning(true);
      } catch (err: any) {
        console.error('Failed to start camera for QR:', err);
        setIsQrScanning(false);
        setQrError(
          err?.name === 'NotAllowedError'
            ? 'Izin akses kamera ditolak. Berikan izin kamera di pengaturan browser hp Anda.'
            : 'Kamera tidak dapat diakses atau sedang digunakan oleh aplikasi lain.'
        );
      }
    }, 200);
  }, [stopQrScanner]);

  // Switch tabs & start/stop corresponding camera
  useEffect(() => {
    if (!isOpen) {
      stopLiveCamera();
      stopQrScanner();
      setImagePreview(null);
      setAiResult(null);
      setAiError(null);
      setMatchedProducts([]);
      setScannedCode(null);
      setBarcodeMatchedProduct(null);
      return;
    }

    if (activeTab === 'ai_vision') {
      stopQrScanner();
      if (!imagePreview) {
        startLiveCamera(cameraFacing);
      }
    } else if (activeTab === 'qr_barcode') {
      stopLiveCamera();
      startQrScanner();
    }

    return () => {
      stopLiveCamera();
      stopQrScanner();
    };
  }, [isOpen, activeTab, cameraFacing, imagePreview, startLiveCamera, stopLiveCamera, stopQrScanner, startQrScanner]);

  // Helper to resize/compress image before sending to AI (speeds up response to ~1s)
  const resizeImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // Instant snapshot from live camera stream - ZERO "Gunakan foto" confirmation dialog!
  const captureLiveSnapshot = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawBase64 = canvas.toDataURL('image/jpeg', 0.85);

    // Stop live stream and freeze preview
    stopLiveCamera();
    setImagePreview(rawBase64);

    // Compress for fast AI processing
    const compressedBase64 = await resizeImage(rawBase64, 1024, 1024, 0.8);

    // NOTE: Foto scan TIDAK diunggah ke Cloudinary agar Cloudinary tidak penuh!
    // Langsung diproses dengan AI
    await analyzeVoucherWithAi(compressedBase64, 'image/jpeg', rawBase64);
  };

  // Handle fallback file upload or gallery selection
  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopLiveCamera();
    setAiError(null);
    setAiResult(null);
    setMatchedProducts([]);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawBase64 = event.target?.result as string;
      setImagePreview(rawBase64);

      const compressedBase64 = await resizeImage(rawBase64, 1024, 1024, 0.8);
      // NOTE: Foto scan TIDAK diunggah ke Cloudinary!
      await analyzeVoucherWithAi(compressedBase64, file.type || 'image/jpeg', rawBase64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Call Server-side or Client-side Gemini API for Voucher & Kuota Analysis
  const analyzeVoucherWithAi = async (base64Image: string, mimeType: string, fullImage: string) => {
    setIsAiLoading(true);
    setAiError(null);

    const apiKey = settings.geminiApiKey || localStorage.getItem('catatusaha_gemini_api_key') || '';

    try {
      let scanData: AiScanResult | null = null;

      // 1. Try server proxy first
      const res = await fetch('/api/gemini/scan-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Image,
          mimeType,
          geminiApiKey: apiKey,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          scanData = json.data;
        }
      }

      // 2. Fallback: direct client-side GoogleGenAI execution if apiKey is configured
      if (!scanData && apiKey) {
        const aiClient = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const prompt = `Anda adalah sistem AI Vision kasir & konter pulsa di Indonesia yang sangat ahli dalam membaca fisik voucher kuota internet, kartu perdana, atau stiker/catatan label tulisan spidol voucher konter.
Tugas Anda adalah mengekstrak:
1. OPERATOR / PROVIDER (Tri, Telkomsel, Indosat, XL, Axis, Smartfren)
2. TULISAN TANGAN / SPIDOL (misal "10/3" artinya 10GB 3 hari)
3. NAMA PRODUK & KATA KUNCI DATA MASTER

Kembalikan HANYA JSON murni:
{
  "provider": "Nama Provider",
  "quota": "10 GB",
  "quotaGigabytes": 10,
  "validityDays": "3 Hari",
  "handwrittenNote": "10/3",
  "productName": "Voucher Tri 10 GB (3 Hari)",
  "searchKeyword": "Tri 10 GB",
  "suggestedCost": 0,
  "suggestedPrice": 0,
  "detectedText": "teks terbaca"
}`;

        const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
        let clientResp: any = null;
        for (const m of modelsToTry) {
          try {
            clientResp = await aiClient.models.generateContent({
              model: m,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { inlineData: { mimeType, data: cleanBase64 } },
                    { text: prompt },
                  ],
                },
              ],
              config: {
                temperature: 0.1,
                maxOutputTokens: 600,
              },
            });
            if (clientResp && clientResp.text) break;
          } catch (cErr) {
            console.warn(`Client fallback model ${m} error:`, cErr);
          }
        }

        if (clientResp && clientResp.text) {
          const respText = clientResp.text;
          const jsonMatch = respText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            scanData = JSON.parse(jsonMatch[0]);
          }
        }
      }

      if (scanData) {
        setAiResult(scanData);
        playBeep();
        handleAiDetectionComplete(scanData, fullImage);
        return;
      }

      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Gagal menganalisis gambar. Pastikan Google Gemini API Key sudah dimasukkan di Pengaturan.`);
    } catch (err: any) {
      console.error('Scan voucher error:', err);
      setAiError(err.message || 'Gagal memproses gambar voucher. Pastikan foto jelas dan coba lagi.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Process AI Detection completion:
  // USER REQUIREMENT: "dan ketika produk nya ketemu melalui scan harusnya langsung tersimpan. jadi tidak perlu pilih lagi produknya yang mana."
  const handleAiDetectionComplete = (data: AiScanResult, rawImage: string) => {
    // 1. If inside "Tambah Barang Baru" Form (master_form):
    // Otomatis masukkan nama barang & data dari AI, lalu langsung tutup scanner tanpa perlu konfirmasi manual!
    if (sourceContext === 'master_form' && onScannedVoucherInfo) {
      const vName = data.productName || `Voucher ${data.provider} ${data.quota}${data.validityDays ? ` (${data.validityDays})` : ''}`.trim();
      onScannedVoucherInfo({
        name: vName,
        category: 'Pulsa',
        sku: `VCR-${(data.provider || 'DATA').slice(0, 4).toUpperCase()}${data.quotaGigabytes ? `${data.quotaGigabytes}GB` : Date.now().toString().slice(-4)}`,
        quota: data.quota,
        quotaGigabytes: data.quotaGigabytes,
        provider: data.provider,
        validityDays: data.validityDays,
        handwrittenNote: data.handwrittenNote,
        suggestedCost: data.suggestedCost,
        suggestedPrice: data.suggestedPrice,
        imageUrl: rawImage, // Foto lokal untuk form Tambah Barang, disimpan ke Cloudinary saat produk disimpan
        isCloudinaryUploaded: false,
      });
      playBeep();
      onClose();
      return;
    }

    // 2. Match with Data Master products
    const providerTerm = (data.provider || '').toLowerCase().trim();
    const quotaTerm = (data.quota || '').toLowerCase().trim();
    const gigabytes = data.quotaGigabytes;
    const noteTerm = (data.handwrittenNote || '').toLowerCase().trim();
    const validityTerm = (data.validityDays || '').toLowerCase().trim();

    const matches = products.filter((p) => {
      const pName = p.name.toLowerCase();
      const pCat = p.category.toLowerCase();
      const pSku = (p.sku || '').toLowerCase();

      // Check if product specifically matches handwritten note (e.g. "10/3")
      if (noteTerm && (pName.includes(noteTerm) || pSku.includes(noteTerm))) {
        return true;
      }

      // Check provider
      const hasProvider =
        providerTerm &&
        (pName.includes(providerTerm) ||
          pCat.includes(providerTerm) ||
          pSku.includes(providerTerm) ||
          (providerTerm.includes('indosat') && (pName.includes('im3') || pCat.includes('im3'))) ||
          (providerTerm.includes('telkomsel') && (pName.includes('tsel') || pName.includes('simpati'))));

      // Check quota
      const rawQuotaNoSpace = quotaTerm.replace(/\s+/g, '');
      const hasQuota =
        (quotaTerm && (pName.includes(quotaTerm) || pName.includes(rawQuotaNoSpace))) ||
        (gigabytes && (pName.includes(`${gigabytes}gb`) || pName.includes(`${gigabytes} gb`)));

      if (hasProvider && hasQuota) return true;
      if (hasQuota) return true;
      if (hasProvider && data.productName && pName.includes(data.productName.toLowerCase())) return true;
      return false;
    });

    matches.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      let scoreA = 0;
      let scoreB = 0;
      if (providerTerm && aName.includes(providerTerm)) scoreA += 2;
      if (providerTerm && bName.includes(providerTerm)) scoreB += 2;
      if (validityTerm && aName.includes(validityTerm)) scoreA += 2;
      if (validityTerm && bName.includes(validityTerm)) scoreB += 2;
      if (noteTerm && aName.includes(noteTerm)) scoreA += 3;
      if (noteTerm && bName.includes(noteTerm)) scoreB += 3;
      return scoreB - scoreA;
    });

    setMatchedProducts(matches);

    // USER REQUIREMENT: Jika ketemu produknya, LANGSUNG TERSIMPAN / TERPILIH! Tidak perlu pilih lagi!
    if (matches.length > 0 && onSelectProduct && sourceContext !== 'master_form') {
      playBeep();
      onSelectProduct(matches[0]);
      onClose();
      return;
    }
  };

  // Handle scanned QR / Barcode
  // USER REQUIREMENT: Langsung terpilih dan tersimpan tanpa perlu pilih manual
  const handleBarcodeScanned = (code: string) => {
    if (!code) return;
    playBeep();
    setScannedCode(code);
    stopQrScanner();

    // Match with products in Data Master
    const normalizedCode = code.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === normalizedCode) ||
        p.id.toLowerCase() === normalizedCode ||
        p.name.toLowerCase().includes(normalizedCode)
    );

    if (matched) {
      setBarcodeMatchedProduct(matched);

      // JIKA KETEMU PRODUKNYA: LANGSUNG PILIH & SIMPAN KE TRANSAKSI / FORM
      if (sourceContext === 'master_form' && onScannedBarcode) {
        onScannedBarcode(matched.sku || code);
        onClose();
        return;
      }

      if (onSelectProduct) {
        onSelectProduct(matched);
        onClose();
        return;
      }
    } else {
      setBarcodeMatchedProduct(null);
      // Jika di form master dan barcode belum ada, langsung gunakan kodenya ke form SKU
      if (sourceContext === 'master_form' && onScannedBarcode) {
        onScannedBarcode(code);
        onClose();
        return;
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto border border-slate-100 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <ScanLine className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100">
                {title || (sourceContext === 'master_form' ? 'Scan Barcode / Voucher ke Form Master' : sourceContext === 'master_search' ? 'Scan & Cari di Data Master' : 'Scan Kasir Cerdas')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {subtitle || (sourceContext === 'master_form' ? 'Arahkan kamera ke barcode fisik atau voucher untuk otomatis mengisi form' : 'AI Vision Voucher Kuota & Barcode — Otomatis Terpilih')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopLiveCamera();
              stopQrScanner();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => {
              setImagePreview(null);
              setAiResult(null);
              setActiveTab('ai_vision');
            }}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
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
            onClick={() => {
              setActiveTab('qr_barcode');
            }}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">

          {/* =================================================================== */}
          {/* TAB 1: AI VISION SCANNER (LIVE CAMERA FEED - NO CONFIRMATION)       */}
          {/* =================================================================== */}
          {activeTab === 'ai_vision' && (
            <div className="space-y-3.5">
              
              {/* Petunjuk Cepat */}
              <div className="bg-teal-50/90 border border-teal-200/70 rounded-2xl p-3 flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Wifi className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs text-teal-900 leading-snug">
                  <span className="font-bold">Scan Langsung (Tanpa Konfirmasi):</span> Arahkan kamera ke voucher / kartu kuota, lalu tekan tombol <b>Jepret & Scan</b>. AI akan mendeteksi kuota (GB) & otomatis memilih produk jika sudah ada.
                </div>
              </div>

              {/* LIVE CAMERA FEED & SHUTTER (OR PREVIEW IF CAPTURED) */}
              {!imagePreview ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-4/3 max-w-md mx-auto flex items-center justify-center shadow-md border border-slate-800">
                    
                    {/* HTML5 Live Video Stream */}
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder Overlays & Guidelines */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-4/5 h-3/5 border-2 border-teal-400/80 rounded-2xl relative shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-teal-400" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-teal-400" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-3 border-b-3 border-teal-400" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-3 border-b-3 border-teal-400" />
                        
                        <div className="absolute inset-x-0 bottom-2 text-center">
                          <span className="px-2 py-0.5 bg-black/60 text-teal-300 text-[10px] font-bold rounded-full backdrop-blur-xs">
                            Posisikan Voucher / Kuota di Kotak
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Switch camera button (Front/Rear) */}
                    <button
                      type="button"
                      onClick={handleToggleCamera}
                      className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-xs border border-white/20 transition cursor-pointer"
                      title="Balik Kamera Depan / Belakang"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>

                    {/* Camera error message fallback */}
                    {liveCameraError && (
                      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center text-white space-y-2">
                        <AlertCircle className="w-8 h-8 text-amber-400" />
                        <p className="text-xs text-slate-200 max-w-xs">{liveCameraError}</p>
                        <button
                          type="button"
                          onClick={() => fallbackCameraInputRef.current?.click()}
                          className="px-3.5 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-teal-700 transition cursor-pointer"
                        >
                          Buka Kamera Sistem HP
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SHUTTER BUTTON: AMBIL FOTO LANGSUNG (TANPA KONFIRMASI) */}
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={captureLiveSnapshot}
                      className="flex-1 py-3.5 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-teal-700/20 transition cursor-pointer"
                    >
                      <Camera className="w-5 h-5" />
                      <span>📸 Jepret & Scan Sekarang</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition cursor-pointer"
                      title="Pilih dari Galeri / File"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Captured Image View with Scanning State */
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-4/3 max-w-md mx-auto flex items-center justify-center border border-slate-200 shadow-inner">
                    <img
                      src={imagePreview}
                      alt="Pratinjau Voucher"
                      className="w-full h-full object-contain"
                    />

                    {/* AI Scanning animation overlay */}
                    {isAiLoading && (
                      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center text-white">
                        <div className="relative w-14 h-14 mb-3">
                          <Loader2 className="w-14 h-14 animate-spin text-teal-400" />
                          <Sparkles className="w-6 h-6 text-amber-300 absolute inset-0 m-auto animate-pulse" />
                        </div>
                        <p className="font-bold text-sm">Menganalisis Voucher dengan AI...</p>
                        <p className="text-xs text-slate-300 mt-1 max-w-xs">
                          Membaca kuota (GB), operator, dan tulisan spidol secara instan...
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Button Foto Ulang */}
                  {!isAiLoading && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview(null);
                          setAiResult(null);
                          setAiError(null);
                          setMatchedProducts([]);
                          startLiveCamera(cameraFacing);
                        }}
                        className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-teal-50 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Foto Ulang Kamera</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Hidden file inputs for gallery and fallback camera */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileCapture}
                className="hidden"
              />
              <input
                ref={fallbackCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileCapture}
                className="hidden"
              />

              {/* Error Box */}
              {aiError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="space-y-1">
                    <div className="font-bold">Gagal Menganalisis Gambar</div>
                    <div className="text-[11px] leading-relaxed">{aiError}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setAiResult(null);
                        setAiError(null);
                        startLiveCamera(cameraFacing);
                      }}
                      className="text-teal-700 font-bold underline text-xs cursor-pointer"
                    >
                      Coba Ambil Foto Lagi
                    </button>
                  </div>
                </div>
              )}

              {/* Hasil AI Scan jika TIDAK langsung otomatis keluar (misal produk belum ada di master) */}
              {aiResult && !isAiLoading && matchedProducts.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in zoom-in-95">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Hasil Deteksi AI
                    </span>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                      Belum di Data Master
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-teal-100 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Kuota Terbaca</div>
                        <div className="text-xl font-black text-teal-700 tracking-tight">
                          {aiResult.quota || 'Tidak terbaca'}
                        </div>
                        <div className="text-xs text-slate-600 font-bold mt-0.5">
                          {aiResult.provider} {aiResult.productName ? `• ${aiResult.productName}` : ''}
                        </div>
                      </div>

                      {aiResult.validityDays && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200">
                          Aktif {aiResult.validityDays}
                        </span>
                      )}
                    </div>

                    {aiResult.handwrittenNote && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-900">✏️ Spidol: {aiResult.handwrittenNote}</span>
                        <span className="text-[10px] text-amber-700">{aiResult.quota}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions for unmatched product */}
                  <div className="space-y-2 pt-1">
                    {onScannedVoucherInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          const vName = aiResult.productName || `Voucher ${aiResult.provider} ${aiResult.quota}${aiResult.validityDays ? ` (${aiResult.validityDays})` : ''}`.trim();
                          onScannedVoucherInfo({
                            name: vName,
                            category: 'Pulsa',
                            sku: `VCR-${(aiResult.provider || 'DATA').slice(0, 4).toUpperCase()}${aiResult.quotaGigabytes ? `${aiResult.quotaGigabytes}GB` : Date.now().toString().slice(-4)}`,
                            quota: aiResult.quota,
                            quotaGigabytes: aiResult.quotaGigabytes,
                            provider: aiResult.provider,
                            validityDays: aiResult.validityDays,
                            handwrittenNote: aiResult.handwrittenNote,
                            suggestedCost: aiResult.suggestedCost,
                            suggestedPrice: aiResult.suggestedPrice,
                            imageUrl: imagePreview || undefined,
                            isCloudinaryUploaded: false,
                          });
                          onClose();
                        }}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>+ Daftarkan Sebagai Produk Baru di Data Master</span>
                      </button>
                    )}

                    {onApplySearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          const term = aiResult.searchKeyword || `${aiResult.provider} ${aiResult.quota}`.trim();
                          onApplySearchQuery(term);
                          onClose();
                        }}
                        className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition border border-teal-200 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Cari "{aiResult.searchKeyword || `${aiResult.provider} ${aiResult.quota}`}" di Kasir</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =================================================================== */}
          {/* TAB 2: QR CODE & BARCODE SCANNER (AUTO SELECT PRODUCT)              */}
          {/* =================================================================== */}
          {activeTab === 'qr_barcode' && (
            <div className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-200/60 rounded-2xl p-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs text-blue-900 leading-relaxed">
                  <span className="font-bold">Scan Barcode / QR Code:</span> Arahkan kamera ke barcode produk. Jika produk sudah terdaftar, <span className="font-bold underline">langsung otomatis tersimpan/terpilih</span> tanpa perlu klik lagi!
                </div>
              </div>

              {/* Viewfinder container */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[300px] mx-auto flex items-center justify-center shadow-md border border-slate-800">
                <div id="qr-reader-container" className="w-full h-full" />

                {isQrScanning && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center">
                    <div className="w-44 h-44 border-2 border-teal-400/80 rounded-2xl relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-teal-400" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-teal-400" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-2 border-b-2 border-teal-400" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-2 border-b-2 border-teal-400" />
                      <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_red] animate-bounce mt-22" />
                    </div>
                  </div>
                )}
              </div>

              {/* QR scanner error */}
              {qrError && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <div className="font-bold">Kendala Kamera</div>
                    <div className="mt-0.5">{qrError}</div>
                    <button
                      type="button"
                      onClick={startQrScanner}
                      className="mt-2 text-xs font-bold text-teal-700 underline cursor-pointer"
                    >
                      Buka Kamera Lagi
                    </button>
                  </div>
                </div>
              )}

              {/* Scanned code not found in master */}
              {scannedCode && !barcodeMatchedProduct && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      Kode Barcode <b>"{scannedCode}"</b> belum terdaftar di Data Master.
                    </div>
                  </div>

                  {onScannedBarcode && (
                    <button
                      type="button"
                      onClick={() => {
                        onScannedBarcode(scannedCode);
                        onClose();
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Daftarkan Kode Barcode Ini ke Data Master</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

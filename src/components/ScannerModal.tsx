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
  Layers,
  ArrowRight,
  Key
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenAI } from '@google/genai';
import { Product } from '../types';
import { useData } from '../context/DataContext';
import { uploadToCloudinary } from '../utils/cloudinary';

export interface ScannedVoucherData {
  name: string;
  category: string;
  sku: string;
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

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct?: (product: Product) => void;
  onApplySearchQuery?: (query: string) => void;
  onScannedBarcode?: (barcode: string) => void;
  onScannedVoucherInfo?: (voucher: ScannedVoucherData) => void;
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

interface CardVoucherData {
  name: string;
  provider: string;
  quota: string;
  validity: string;
  handwrittenNote?: string;
  cost: number;
  price: number;
  stock: number;
  imageUrl: string;
  sku: string;
  category: string;
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
  const { settings, addProduct, updateSettings } = useData();
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
  const [quickApiKeyInput, setQuickApiKeyInput] = useState('');
  const [quickKeySaved, setQuickKeySaved] = useState(false);
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);

  // Registration / Edit Card states (TIDAK LANGSUNG TERSAVE)
  const [cardVoucherForm, setCardVoucherForm] = useState<CardVoucherData | null>(null);
  const [isSavingMasterProduct, setIsSavingMasterProduct] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Live Camera stream states for AI Vision
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
  const cardPhotoFileInputRef = useRef<HTMLInputElement>(null);
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

  // Helper to stop live camera stream
  const stopLiveCamera = useCallback(() => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop warning:', e);
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

    setTimeout(async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Kamera tidak didukung oleh browser ini.');
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facing },
            width: { min: 1280, ideal: 1920, max: 2560 },
            height: { min: 720, ideal: 1080, max: 1440 },
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
            : 'Kamera tidak dapat diakses langsung. Anda bisa menggunakan tombol kamera sistem HP atau galeri di bawah.'
        );
      }
    }, 150);
  }, [cameraFacing, stopLiveCamera]);

  // Toggle front/back camera
  const handleToggleCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (!imagePreview && !cardVoucherForm) {
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
          () => {
            // Scanning frame loop
          }
        );
        setIsQrScanning(true);
      } catch (err: any) {
        console.error('Failed to start QR code reader:', err);
        setQrError('Tidak dapat membuka kamera untuk barcode/QR. Pastikan izin kamera telah diberikan.');
        setIsQrScanning(false);
      }
    }, 150);
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
      setCardVoucherForm(null);
      setSaveSuccessMessage(null);
      return;
    }

    if (activeTab === 'ai_vision') {
      stopQrScanner();
      if (!imagePreview && !cardVoucherForm) {
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
  }, [isOpen, activeTab, cameraFacing, imagePreview, cardVoucherForm, startLiveCamera, stopLiveCamera, stopQrScanner, startQrScanner]);

  // Helper to resize/compress image before sending to AI
  const resizeImage = (base64Str: string, maxWidth = 1600, maxHeight = 1600, quality = 0.9): Promise<string> => {
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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // Instant snapshot from live camera stream
  const captureLiveSnapshot = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    canvas.width = vWidth;
    canvas.height = vHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, vWidth, vHeight);
    const rawBase64 = canvas.toDataURL('image/jpeg', 0.9);

    // Stop live stream and freeze preview
    stopLiveCamera();
    setImagePreview(rawBase64);

    // Keep sharp for OCR reading yet fast transmission (under 250KB)
    const compressedBase64 = await resizeImage(rawBase64, 1024, 1024, 0.85);

    // Process with AI
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
    setCardVoucherForm(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawBase64 = event.target?.result as string;
      setImagePreview(rawBase64);

      const compressedBase64 = await resizeImage(rawBase64, 1024, 1024, 0.85);
      await analyzeVoucherWithAi(compressedBase64, file.type || 'image/jpeg', rawBase64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle changing photo on card from gallery/file
  const handleCardPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawBase64 = event.target?.result as string;
      if (rawBase64 && cardVoucherForm) {
        setCardVoucherForm({ ...cardVoucherForm, imageUrl: rawBase64 });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Quick save API key from modal if missing in hosting and retry
  const handleSaveQuickApiKeyAndRetry = async () => {
    const key = quickApiKeyInput.trim();
    if (!key) return;
    localStorage.setItem('catatusaha_gemini_api_key', key);
    try {
      await updateSettings({ geminiApiKey: key });
    } catch (e) {
      console.warn('Failed to persist settings, stored in localStorage:', e);
    }
    setQuickKeySaved(true);
    setAiError(null);
    if (imagePreview) {
      const compressedBase64 = await resizeImage(imagePreview, 1024, 1024, 0.85);
      await analyzeVoucherWithAi(compressedBase64, 'image/jpeg', imagePreview);
    }
  };

  // Call Server-side or Client-side Gemini API for Voucher & Kuota Analysis
  const analyzeVoucherWithAi = async (base64Image: string, mimeType: string, fullImage: string) => {
    setIsAiLoading(true);
    setAiError(null);

    // Resolve API key with comprehensive fallbacks:
    // 1. Settings from Firestore / DataContext
    // 2. localStorage saved key
    // 3. Vite build environment key (injected at build time into import.meta.env or process.env)
    const envKey =
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      (typeof process !== 'undefined' && (process.env as any)?.GEMINI_API_KEY) ||
      '';
    const apiKey = settings.geminiApiKey || localStorage.getItem('catatusaha_gemini_api_key') || envKey;

    try {
      let scanData: AiScanResult | null = null;
      let serverErrorDetail = '';

      // 1. Try server proxy endpoint (/api/gemini/scan-voucher)
      // This works in development preview and on hosting with server.ts or Vercel serverless functions
      try {
        const res = await fetch('/api/gemini/scan-voucher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Image,
            mimeType,
            geminiApiKey: apiKey,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && json.data) {
            scanData = json.data;
          }
        } else if (!res.ok) {
          if (contentType.includes('application/json')) {
            const errJson = await res.json().catch(() => ({}));
            serverErrorDetail = errJson.error || '';
          }
          console.warn('Server proxy scan failed with status', res.status, serverErrorDetail);
        }
      } catch (serverErr: any) {
        console.warn('Server proxy unavailable or offline, falling back to direct AI client:', serverErr);
      }

      // 2. Client-side fallback: Direct GoogleGenAI execution in the browser
      // This is crucial for static hosting (Firebase Hosting, GitHub Pages, Netlify static, Cloudflare Pages, etc.)
      if (!scanData && apiKey) {
        try {
          const aiClient = new GoogleGenAI({
            apiKey,
            // Do NOT set forbidden User-Agent header in browser environment
          });

          const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
          const prompt = `Anda adalah sistem AI Vision kasir & counter pulsa di Indonesia yang SANGAT TELITI, CEPAT, dan AKURAT dalam membaca fisik voucher kuota internet, kartu perdana, atau stiker/catatan label tulisan spidol voucher konter pulsa.
Tugas Anda adalah menganalisis gambar voucher / kartu perdana / tulisan spidol ini dengan sangat cermat dan mengekstrak data berikut:

1. OPERATOR / PROVIDER:
   - Kenali nama provider dari logo resmi, tulisan cetak, warna kartu, atau singkatan:
     * "Tri" / "3" / "Three"
     * "Telkomsel" / "Tsel" / "Simpati" / "AS" / "by.U"
     * "Indosat" / "IM3" / "Ooredoo"
     * "XL" / "XL Axiata"
     * "Axis" / "Aigo"
     * "Smartfren" / "SF"

2. KUOTA (GB) & MASA AKTIF (HARI):
   - Baca tulisan kuota cetak (misal: "14 GB", "10 GB", "2 GB", "3 GB", "5 GB", "35 GB", "1.5 GB", "1.2 GB").
   - Baca masa aktif cetak (misal: "3 Hari", "5 Hari", "7 Hari", "14 Hari", "30 Hari", "60 Hari").
   - SANGAT PENTING - TULISAN TANGAN / SPIDOL PENJUAL KONTER:
     Pemilik konter pulsa di Indonesia SANGAT SERING menulis ringkasan dengan SPIDOL di kartu/voucher, misalnya format angka "X/Y":
     * "10/3" -> Kuota: 10 GB, Masa Aktif: 3 Hari
     * "3/5" -> Kuota: 3 GB, Masa Aktif: 5 Hari
     * "1.5/3" -> Kuota: 1.5 GB, Masa Aktif: 3 Hari
     * "14/30" -> Kuota: 14 GB, Masa Aktif: 30 Hari
     * "2/3" -> Kuota: 2 GB, Masa Aktif: 3 Hari
     * "25/30" -> Kuota: 25 GB, Masa Aktif: 3 Hari
     Jika menemukan tulisan format angka "X/Y" seperti ini, artikan X sebagai Kuota GB dan Y sebagai Masa Aktif Hari.

3. NAMA PRODUK LENGKAP:
   - Buatkan nama produk standar yang sangat jelas dan rapi:
     Format: "Voucher [Provider] [Berapa Giga] GB [Berapa Hari] Hari"
     Contoh:
     * "Voucher Tri 10 GB 3 Hari"
     * "Voucher Telkomsel 14 GB 30 Hari"
     * "Voucher Axis 2 GB 3 Hari"
     * "Voucher Indosat 10 GB 30 Hari"
     * "Voucher XL 10 GB 30 Hari"

Kembalikan HANYA format JSON murni tanpa markdown triple backticks:
{
  "provider": "Nama Provider",
  "quota": "10 GB",
  "quotaGigabytes": 10,
  "validityDays": "3 Hari",
  "handwrittenNote": "10/3",
  "productName": "Voucher Tri 10 GB 3 Hari",
  "searchKeyword": "Tri 10 GB",
  "suggestedCost": 0,
  "suggestedPrice": 0,
  "detectedText": "Ringkasan teks terbaca"
}`;

          const modelsToTry = [
            'gemini-3.5-flash-lite',
            'gemini-flash-latest',
            'gemini-3.8-flash',
          ];
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
                  responseMimeType: 'application/json',
                },
              });
              if (clientResp && clientResp.text) break;
            } catch (cErr: any) {
              console.warn(`Client fallback model ${m} error:`, cErr);
            }
          }

          if (clientResp && clientResp.text) {
            const respText = clientResp.text;
            const jsonMatch = respText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              scanData = JSON.parse(jsonMatch[0]);
            } else {
              scanData = JSON.parse(respText);
            }
          }
        } catch (clientDirectErr: any) {
          console.error('Direct client Gemini AI error:', clientDirectErr);
          if (!serverErrorDetail) {
            serverErrorDetail = clientDirectErr?.message || '';
          }
        }
      }

      if (scanData) {
        setAiResult(scanData);
        playBeep();
        handleAiDetectionComplete(scanData, fullImage);
        return;
      }

      // If neither server nor client succeeded:
      if (!apiKey) {
        throw new Error(
          'Google Gemini API Key belum terpasang di hosting. Silakan masukkan Gemini API Key di Pengaturan Usaha > Tab Gemini AI agar fitur scan gambar voucher aktif di hosting.'
        );
      }

      throw new Error(
        serverErrorDetail ||
          'Gagal menganalisis gambar voucher. Pastikan gambar voucher tampak jelas dan pencahayaan cukup lalu coba lagi.'
      );
    } catch (err: any) {
      console.error('Scan voucher error:', err);
      setAiError(err.message || 'Gagal memproses gambar voucher. Pastikan foto fokus & jelas lalu coba lagi.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Process AI Detection completion:
  // USER REQUIREMENT:
  // "saat scan data master atatu tambah barang master tidak langsung tersave melainkan masih di kartu itu
  // lalu muncul di label nama voucher yang di scan. nanti muncul namanya sama berapa giga dan harinya
  // kemudian dibawahnya inputan modal dan inputan jual lalu bawahnya lagi ada inputan berapa jumlahnya
  // baru nnti simpan manual untuk gambar dari gambar yang di foto itu atau dari ambil file"
  const handleAiDetectionComplete = (data: AiScanResult, rawImage: string) => {
    const formattedName = data.productName || 
      `Voucher ${data.provider || ''} ${data.quota || ''} ${data.validityDays ? `${data.validityDays}` : ''}`.replace(/\s+/g, ' ').trim();

    const voucherCardData: CardVoucherData = {
      name: formattedName || 'Voucher Kuota Internet',
      provider: data.provider || '',
      quota: data.quota || '',
      validity: data.validityDays || '',
      handwrittenNote: data.handwrittenNote,
      cost: data.suggestedCost && data.suggestedCost > 0 ? data.suggestedCost : 0,
      price: data.suggestedPrice && data.suggestedPrice > 0 ? data.suggestedPrice : 0,
      stock: 10,
      imageUrl: rawImage, // Foto yang difoto itu!
      sku: `VCR-${(data.provider || 'DATA').slice(0, 4).toUpperCase()}${data.quotaGigabytes ? `${data.quotaGigabytes}GB` : Date.now().toString().slice(-4)}`,
      category: 'Pulsa',
    };

    // If scanning from Data Master or Tambah Barang Master:
    // TETAP DI KARTU ITU (tidak langsung tersave!)
    if (sourceContext === 'master_search' || sourceContext === 'master_form') {
      setCardVoucherForm(voucherCardData);
      return;
    }

    // In Kasir (POS):
    // Check if product already exists in master
    const providerTerm = (data.provider || '').toLowerCase().trim();
    const quotaTerm = (data.quota || '').toLowerCase().trim();
    const gigabytes = data.quotaGigabytes;
    const noteTerm = (data.handwrittenNote || '').toLowerCase().trim();
    const validityTerm = (data.validityDays || '').toLowerCase().trim();

    const matches = products.filter((p) => {
      const pName = p.name.toLowerCase();
      const pCat = p.category.toLowerCase();
      const pSku = (p.sku || '').toLowerCase();

      if (noteTerm && (pName.includes(noteTerm) || pSku.includes(noteTerm))) return true;

      const hasProvider =
        providerTerm &&
        (pName.includes(providerTerm) ||
          pCat.includes(providerTerm) ||
          pSku.includes(providerTerm) ||
          (providerTerm.includes('indosat') && (pName.includes('im3') || pCat.includes('im3'))) ||
          (providerTerm.includes('telkomsel') && (pName.includes('tsel') || pName.includes('simpati'))));

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

    // In POS: If already registered in master, auto-select immediately
    if (matches.length > 0 && onSelectProduct) {
      playBeep();
      onSelectProduct(matches[0]);
      onClose();
      return;
    }

    // In POS: If NOT found in master, show card so cashier can easily register it
    setCardVoucherForm(voucherCardData);
  };

  // Handle scanned QR / Barcode
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
      if (onSelectProduct && sourceContext === 'pos') {
        onSelectProduct(matched);
        onClose();
        return;
      }
    }

    // If scanning in master: open registration card with barcode prefilled
    if (sourceContext === 'master_search' || sourceContext === 'master_form') {
      if (matched) {
        setCardVoucherForm({
          name: matched.name,
          provider: matched.provider || '',
          quota: matched.quota || '',
          validity: matched.validity || '',
          cost: matched.cost,
          price: matched.price,
          stock: matched.stock,
          imageUrl: matched.imageUrl || '',
          sku: matched.sku || code,
          category: matched.category,
        });
      } else {
        setCardVoucherForm({
          name: '',
          provider: '',
          quota: '',
          validity: '',
          cost: 0,
          price: 0,
          stock: 10,
          imageUrl: '',
          sku: code,
          category: 'Sembako',
        });
      }
    }
  };

  // USER REQUIREMENT: Manual Save to Data Master
  const handleManualSaveMasterProduct = async () => {
    if (!cardVoucherForm) return;
    if (!cardVoucherForm.name.trim()) {
      alert('Nama barang / voucher tidak boleh kosong');
      return;
    }

    setIsSavingMasterProduct(true);
    try {
      let finalImageUrl = cardVoucherForm.imageUrl || '';

      // Upload to Cloudinary only when saving to Master (preserves Cloudinary quota)
      if (finalImageUrl.startsWith('data:image/')) {
        try {
          const cRes = await uploadToCloudinary(finalImageUrl);
          if (cRes.success && cRes.url) {
            finalImageUrl = cRes.url;
          }
        } catch (uploadErr) {
          console.warn('Cloudinary upload warning:', uploadErr);
        }
      }

      // Save to Firestore / Data Master
      await addProduct({
        name: cardVoucherForm.name.trim(),
        category: cardVoucherForm.category || 'Pulsa',
        sku: cardVoucherForm.sku || `VCR-${Date.now().toString().slice(-4)}`,
        price: Number(cardVoucherForm.price) || 0,
        cost: Number(cardVoucherForm.cost) || 0,
        stock: Number(cardVoucherForm.stock) || 0,
        minStock: 2,
        unit: 'Pcs',
        isFuel: false,
        imageUrl: finalImageUrl,
        provider: cardVoucherForm.provider,
        quota: cardVoucherForm.quota,
        validity: cardVoucherForm.validity,
      });

      // If opened from Master Form, also update parent form
      if (onScannedVoucherInfo) {
        onScannedVoucherInfo({
          name: cardVoucherForm.name.trim(),
          category: cardVoucherForm.category || 'Pulsa',
          sku: cardVoucherForm.sku,
          imageUrl: finalImageUrl,
          provider: cardVoucherForm.provider,
          quota: cardVoucherForm.quota,
          validityDays: cardVoucherForm.validity,
          suggestedCost: cardVoucherForm.cost,
          suggestedPrice: cardVoucherForm.price,
          isCloudinaryUploaded: true,
        });
      }

      playBeep();
      setSaveSuccessMessage(`✓ Berhasil menyimpan "${cardVoucherForm.name}" ke Data Master!`);

      setTimeout(() => {
        setIsSavingMasterProduct(false);
        setCardVoucherForm(null);
        setImagePreview(null);
        setAiResult(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving master product:', err);
      alert('Gagal menyimpan ke Data Master: ' + (err.message || 'Error'));
      setIsSavingMasterProduct(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-sm shadow-teal-600/30">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base">
                {title || (sourceContext === 'master_search' || sourceContext === 'master_form' 
                  ? 'Scan & Tambah Voucher Data Master' 
                  : 'Scan Barcode & Voucher Kuota')}
              </h2>
              <p className="text-xs text-slate-500">
                {subtitle || (sourceContext === 'master_search' || sourceContext === 'master_form'
                  ? 'Scan kartu kuota, isi modal, jual, & stok, lalu simpan manual'
                  : 'Scan kamera untuk kasir cepat & otomatis')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopLiveCamera();
              stopQrScanner();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector (Hidden if card form is active) */}
        {!cardVoucherForm && (
          <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('ai_vision');
              }}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
                activeTab === 'ai_vision'
                  ? 'bg-white text-teal-700 border-b-2 border-teal-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>AI Vision (Voucher Kuota GB)</span>
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
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">

          {/* =================================================================== */}
          {/* USER REQUIREMENT: KARTU DATA MASTER (TIDAK LANGSUNG TERSAVE)        */}
          {/* =================================================================== */}
          {cardVoucherForm ? (
            <div className="bg-white rounded-2xl border border-teal-100 shadow-xs p-4 sm:p-5 space-y-4 animate-in zoom-in-95">
              
              {/* Header Kartu */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4 text-teal-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Kartu Tambah Voucher Master</h3>
                    <p className="text-[11px] text-slate-500">Periksa nama, input modal, jual & jumlah, lalu simpan manual</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Hasil AI Terbaca
                </span>
              </div>

              {/* 1. Pratinjau Foto: Dari Foto yang Di-scan ATAU Ambil File Galeri */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Foto Barang / Voucher</label>
                  <span className="text-[10px] text-slate-400">Dari foto scan atau ambil file</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-300 shadow-inner flex items-center justify-center">
                    {cardVoucherForm.imageUrl ? (
                      <img
                        src={cardVoucherForm.imageUrl}
                        alt="Foto Voucher"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full text-left">
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Foto di samping adalah foto voucher yang baru saja discan. Anda bisa menggunakan foto ini atau ganti dengan mengambil file dari galeri.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => cardPhotoFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ganti / Ambil File Galeri</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCardVoucherForm(null);
                          setImagePreview(null);
                          setAiResult(null);
                          startLiveCamera(cameraFacing);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Foto Ulang</span>
                      </button>
                    </div>
                  </div>
                </div>

                <input
                  type="file"
                  ref={cardPhotoFileInputRef}
                  accept="image/*"
                  onChange={handleCardPhotoChange}
                  className="hidden"
                />
              </div>

              {/* 2. Label Nama Voucher yang di-scan: Nama, Berapa Giga, dan Harinya */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Label Nama Voucher yang Di-scan *
                  </label>
                  <span className="text-[10px] text-teal-700 font-semibold">
                    Nama + Berapa Giga + Harinya
                  </span>
                </div>

                {/* Badge ringkasan: Provider, Giga, Hari, Tulisan Spidol */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-teal-50/80 rounded-xl border border-teal-100 text-xs">
                  {cardVoucherForm.provider && (
                    <span className="px-2 py-0.5 bg-white text-teal-800 font-bold rounded-md border border-teal-200">
                      📶 {cardVoucherForm.provider}
                    </span>
                  )}
                  {cardVoucherForm.quota && (
                    <span className="px-2 py-0.5 bg-white text-teal-900 font-extrabold rounded-md border border-teal-200">
                      ⚡ {cardVoucherForm.quota}
                    </span>
                  )}
                  {cardVoucherForm.validity && (
                    <span className="px-2 py-0.5 bg-white text-amber-800 font-bold rounded-md border border-amber-200">
                      ⏳ {cardVoucherForm.validity}
                    </span>
                  )}
                  {cardVoucherForm.handwrittenNote && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-md">
                      ✏️ Spidol: {cardVoucherForm.handwrittenNote}
                    </span>
                  )}
                </div>

                {/* Input teks Nama Voucher */}
                <input
                  type="text"
                  required
                  value={cardVoucherForm.name}
                  onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, name: e.target.value })}
                  placeholder="Contoh: Voucher Tri 10 GB 3 Hari"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold text-slate-900 text-sm"
                />
              </div>

              {/* 3. Inputan Modal (Harga Beli) & Inputan Jual (Harga Jual) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Modal (Harga Beli) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      required
                      value={cardVoucherForm.cost || ''}
                      onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, cost: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold text-slate-800 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Harga Jual *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-teal-600 font-bold">Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      required
                      value={cardVoucherForm.price || ''}
                      onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, price: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-black text-teal-800 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Tampilan Estimasi Keuntungan */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Estimasi Keuntungan per Pcs:</span>
                <span className="font-bold text-emerald-700">
                  +Rp {Math.max(0, cardVoucherForm.price - cardVoucherForm.cost).toLocaleString('id-ID')}
                </span>
              </div>

              {/* 4. Inputan Berapa Jumlahnya (Stok Pcs) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Berapa Jumlahnya (Stok Pcs) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cardVoucherForm.stock || ''}
                  onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, stock: Number(e.target.value) || 1 })}
                  placeholder="10"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold text-slate-900 text-sm"
                />
              </div>

              {/* Feedback Notifikasi Simpan */}
              {saveSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}

              {/* 5. Tombol Simpan Manual */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={isSavingMasterProduct}
                  onClick={handleManualSaveMasterProduct}
                  className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {isSavingMasterProduct ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Menyimpan ke Data Master...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>💾 Simpan Manual ke Data Master</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCardVoucherForm(null);
                    setImagePreview(null);
                    setAiResult(null);
                    startLiveCamera(cameraFacing);
                  }}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Batal / Scan Ulang
                </button>
              </div>
            </div>
          ) : (
            /* Standard Viewfinder Mode */
            <>
              {/* TAB 1: AI VISION SCANNER */}
              {activeTab === 'ai_vision' && (
                <div className="space-y-3.5">
                  
                  {/* Petunjuk Cepat */}
                  <div className="bg-teal-50/90 border border-teal-200/70 rounded-2xl p-3 flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Wifi className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-xs text-teal-900 leading-snug">
                      <span className="font-bold">Scan Voucher Kuota GB:</span> Arahkan kamera ke voucher / kartu perdana / tulisan spidol. Tekan tombol <b>Jepret & Scan</b> untuk mendeteksi nama, kuota GB, dan masa aktif secara otomatis.
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
                                Posisikan Voucher di Kotak
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
                              Buka Kamera HP
                            </button>
                          </div>
                        )}
                      </div>

                      {/* SHUTTER BUTTONS */}
                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={captureLiveSnapshot}
                          className="w-full flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-700/20 transition cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>📸 Jepret & Scan Sekarang</span>
                        </button>

                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => fallbackCameraInputRef.current?.click()}
                            className="flex-1 sm:flex-none px-3.5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                            title="Ambil Foto Tajam dengan Kamera HP"
                          >
                            <Camera className="w-4 h-4 text-teal-600" />
                            <span>Kamera HP (Tajam)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3.5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition cursor-pointer"
                            title="Pilih dari Galeri / File"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                        </div>
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
                              Membaca nama voucher, kuota GB, masa aktif & tulisan spidol...
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
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div className="space-y-1 flex-1">
                          <div className="font-bold">Gagal Menganalisis Gambar</div>
                          <div className="text-[11px] leading-relaxed">{aiError}</div>
                        </div>
                      </div>

                      {/* Quick API Key input if missing in hosting */}
                      {aiError.toLowerCase().includes('gemini') && (
                        <div className="p-2.5 bg-white rounded-xl border border-rose-200 space-y-2 text-slate-800">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="flex items-center gap-1 text-slate-700">
                              <Key className="w-3.5 h-3.5 text-amber-500" />
                              Masukkan Gemini API Key:
                            </span>
                            <span className="text-[10px] text-teal-700 font-semibold">Gratis dari Google AI Studio</span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={quickApiKeyInput}
                              onChange={(e) => setQuickApiKeyInput(e.target.value)}
                              placeholder="Tempel AIzaSy..."
                              className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                            />
                            <button
                              type="button"
                              onClick={handleSaveQuickApiKeyAndRetry}
                              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow-2xs transition cursor-pointer"
                            >
                              Simpan & Scan
                            </button>
                          </div>
                          {quickKeySaved && (
                            <p className="text-[10px] text-emerald-600 font-bold">
                              ✓ API Key tersimpan! Mengulangi analisis...
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview(null);
                            setAiResult(null);
                            setAiError(null);
                            startLiveCamera(cameraFacing);
                          }}
                          className="text-teal-700 hover:text-teal-900 font-bold underline text-xs cursor-pointer"
                        >
                          Coba Ambil Foto Lagi
                        </button>
                        {imagePreview && (
                          <button
                            type="button"
                            onClick={async () => {
                              setAiError(null);
                              const compressedBase64 = await resizeImage(imagePreview, 1024, 1024, 0.85);
                              await analyzeVoucherWithAi(compressedBase64, 'image/jpeg', imagePreview);
                            }}
                            className="text-slate-600 hover:text-slate-900 font-bold text-xs underline cursor-pointer"
                          >
                            Ulangi Analisis Gambar Ini
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: QR CODE & BARCODE SCANNER */}
              {activeTab === 'qr_barcode' && (
                <div className="space-y-4">
                  <div className="bg-blue-50/80 border border-blue-200/60 rounded-2xl p-3 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <QrCode className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-xs text-blue-900 leading-relaxed">
                      <span className="font-bold">Scan Barcode / QR Code:</span> Arahkan kamera ke barcode produk fisik atau kemasan.
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
            </>
          )}

        </div>
      </div>
    </div>
  );
};

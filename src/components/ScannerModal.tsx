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
  Key,
  Package,
  Plus,
  Tag,
  ZoomIn,
  ZoomOut,
  Focus,
  Zap,
  Flashlight
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { GoogleGenAI } from '@google/genai';
import { Product } from '../types';
import { useData } from '../context/DataContext';
import { uploadToCloudinary } from '../utils/cloudinary';
import { compressImage } from '../utils/imageCompressor';
import { formatRupiah } from '../utils/formatters';

const PRODUCT_CATEGORIES = [
  'Sembako',
  'Minuman',
  'Makanan',
  'Snack',
  'Rokok',
  'Pulsa',
  'BBM',
  'Aksesoris',
  'Lainnya',
];

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
  onProductSaved?: (productName: string) => void;
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
  isBarcodeItem?: boolean;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onApplySearchQuery,
  onScannedBarcode,
  onScannedVoucherInfo,
  onProductSaved,
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
  const [aiMatchedProduct, setAiMatchedProduct] = useState<Product | null>(null);
  const [lastAiVoucherData, setLastAiVoucherData] = useState<CardVoucherData | null>(null);

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

  // Auto Zoom & Camera Focus states for Barcode / QR (mengatasi barcode kecil & kamera blur)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const zoomRangeRef = useRef<{ min: number; max: number; step: number; hasHardware: boolean }>({
    min: 1.0,
    max: 4.0,
    step: 0.1,
    hasHardware: false,
  });
  const activeQrTrackRef = useRef<MediaStreamTrack | null>(null);
  const isStartingQrRef = useRef<boolean>(false);
  const isQrScanningActiveRef = useRef<boolean>(false);
  const nativeScanTimerRef = useRef<any>(null);
  const [isTorchAvailable, setIsTorchAvailable] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1.0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallbackCameraInputRef = useRef<HTMLInputElement>(null);
  const qrFallbackFileInputRef = useRef<HTMLInputElement>(null);
  const qrFallbackCameraInputRef = useRef<HTMLInputElement>(null);
  const cardPhotoFileInputRef = useRef<HTMLInputElement>(null);
  const cardPhotoCameraInputRef = useRef<HTMLInputElement>(null);
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

  // Apply hardware camera zoom or fallback digital zoom (Rock-solid, zero camera restarts, zero flicker)
  const applyZoom = useCallback((targetZoom: number) => {
    const clamped = Math.max(
      zoomRangeRef.current.min,
      Math.min(zoomRangeRef.current.max, Math.round(targetZoom * 10) / 10)
    );
    setZoomLevel(clamped);

    // CSS zoom on video element: instant, smooth magnification, 0% chance of camera flashing
    const videoEl = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.style.transform = `scale(${clamped})`;
      videoEl.style.transformOrigin = 'center center';
      videoEl.style.transition = 'transform 0.15s ease-out';
    }

    // Hardware camera sensor zoom if available
    const track = activeQrTrackRef.current;
    if (track) {
      try {
        const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        if (caps && caps.zoom) {
          const hardwareZoom = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 5, clamped));
          track.applyConstraints({
            advanced: [{ zoom: hardwareZoom } as any],
          }).catch(() => {});
        }
      } catch {
        // ignored
      }
    }
  }, []);

  // Stop QR scanner safely
  const stopQrScanner = useCallback(async () => {
    isStartingQrRef.current = false;
    isQrScanningActiveRef.current = false;
    if (nativeScanTimerRef.current) {
      clearInterval(nativeScanTimerRef.current);
      nativeScanTimerRef.current = null;
    }
    activeQrTrackRef.current = null;
    setIsTorchOn(false);
    setIsTorchAvailable(false);

    if (qrReaderRef.current) {
      try {
        if (qrReaderRef.current.isScanning) {
          await qrReaderRef.current.stop();
        }
        await qrReaderRef.current.clear();
      } catch (err) {
        console.warn('Error stopping QR scanner:', err);
      }
      qrReaderRef.current = null;
    }
    setIsQrScanning(false);
  }, []);

  // Handle scanned QR / Barcode
  const handleBarcodeScanned = useCallback((code: string) => {
    if (!code) return;
    isQrScanningActiveRef.current = false;
    if (nativeScanTimerRef.current) {
      clearInterval(nativeScanTimerRef.current);
      nativeScanTimerRef.current = null;
    }

    playBeep();
    const cleanCode = code.trim();
    setScannedCode(cleanCode);
    stopQrScanner();

    // Match with products in Data Master
    const normalizedCode = cleanCode.toLowerCase();
    const matched = products.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === normalizedCode) ||
        p.id.toLowerCase() === normalizedCode ||
        (p.sku && p.sku.replace(/\s+/g, '') === normalizedCode.replace(/\s+/g, ''))
    );

    if (matched) {
      setBarcodeMatchedProduct(matched);
      setCardVoucherForm(null);
      if (onSelectProduct && sourceContext === 'pos') {
        onSelectProduct(matched);
        onClose();
        return;
      }
    } else {
      // If not yet registered: open registration card with barcode prefilled & optional photo
      setBarcodeMatchedProduct(null);
      setCardVoucherForm({
        name: '',
        provider: '',
        quota: '',
        validity: '',
        cost: 0,
        price: 0,
        stock: 10,
        imageUrl: '', // Optional photo for barcode!
        sku: cleanCode,
        category: 'Sembako',
        isBarcodeItem: true,
      });
    }
  }, [products, onSelectProduct, sourceContext, onClose, stopQrScanner]);

  // Toggle camera flashlight (torch)
  const toggleTorch = useCallback(async () => {
    const track = activeQrTrackRef.current;
    if (!track) return;
    try {
      const nextTorch = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch toggle warning:', err);
    }
  }, [isTorchOn]);

  // Start QR & Barcode scanner using Html5Qrcode + native BarcodeDetector for max sensitivity
  const startQrScanner = useCallback(async () => {
    if (isStartingQrRef.current) return;
    if (qrReaderRef.current && qrReaderRef.current.isScanning) {
      return; // Already actively scanning
    }

    isStartingQrRef.current = true;
    setQrError(null);
    setScannedCode(null);
    setBarcodeMatchedProduct(null);

    setTimeout(async () => {
      const element = document.getElementById('qr-reader-container');
      if (!element) {
        isStartingQrRef.current = false;
        return;
      }

      try {
        if (qrReaderRef.current) {
          try {
            if (qrReaderRef.current.isScanning) {
              await qrReaderRef.current.stop();
            }
            await qrReaderRef.current.clear();
          } catch {
            // ignore
          }
          qrReaderRef.current = null;
        }

        // Support all standard 1D Barcode & 2D QR formats
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

        const html5QrCode = new Html5Qrcode('qr-reader-container', {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        qrReaderRef.current = html5QrCode;

        // Use high definition resolution (1080p / 720p) so thin barcode lines are razor sharp!
        await html5QrCode.start(
          {
            facingMode: 'environment',
            width: { min: 1280, ideal: 1920, max: 2560 },
            height: { min: 720, ideal: 1080, max: 1440 },
          },
          {
            fps: 25,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Generous box so barcode is captured anywhere in view
              const width = Math.min(Math.floor(viewfinderWidth * 0.95), 450);
              const height = Math.min(Math.floor(viewfinderHeight * 0.85), 320);
              return { width: Math.max(width, 240), height: Math.max(height, 180) };
            },
            aspectRatio: 1.0,
            disableFlip: true,
          },
          (decodedText) => {
            handleBarcodeScanned(decodedText);
          },
          () => {}
        );

        setIsQrScanning(true);
        isStartingQrRef.current = false;
        isQrScanningActiveRef.current = true;

        // Detect video track, torch, zoom capabilities
        setTimeout(() => {
          const videoEl = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
          if (videoEl && videoEl.srcObject) {
            const stream = videoEl.srcObject as MediaStream;
            const track = stream.getVideoTracks()[0];
            if (track) {
              activeQrTrackRef.current = track;
              const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
              if (caps && caps.zoom) {
                zoomRangeRef.current = {
                  min: caps.zoom.min || 1.0,
                  max: Math.min(caps.zoom.max || 5.0, 5.0),
                  step: caps.zoom.step || 0.1,
                  hasHardware: true,
                };
              }
              if (caps && caps.torch) {
                setIsTorchAvailable(true);
              }
            }
          }

          // Native Android BarcodeDetector parallel engine for instant recognition
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const BarcodeDetectorClass = (window as any).BarcodeDetector;
              const nativeDetector = new BarcodeDetectorClass();

              if (nativeScanTimerRef.current) {
                clearInterval(nativeScanTimerRef.current);
              }

              nativeScanTimerRef.current = setInterval(async () => {
                if (!isQrScanningActiveRef.current) return;
                const v = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
                if (v && v.readyState >= 2 && !v.paused) {
                  try {
                    const detected = await nativeDetector.detect(v);
                    if (detected && detected.length > 0 && detected[0]?.rawValue) {
                      handleBarcodeScanned(detected[0].rawValue);
                    }
                  } catch {
                    // skip frame
                  }
                }
              }, 75);
            } catch (err) {
              console.warn('Native BarcodeDetector not enabled:', err);
            }
          }
        }, 250);

      } catch (err: any) {
        console.warn('Failed to start QR code reader:', err);
        isStartingQrRef.current = false;
        setIsQrScanning(false);

        if (err?.name === 'NotAllowedError' || String(err).toLowerCase().includes('permission denied')) {
          setQrError('Izin akses kamera ditolak oleh browser. Silakan izinkan akses kamera di setelan browser Anda, atau gunakan tombol "Ambil Foto Barcode" di bawah.');
        } else {
          setQrError('Tidak dapat membuka kamera untuk barcode/QR. Anda bisa mencoba lagi atau menggunakan tombol kamera sistem HP di bawah.');
        }
      }
    }, 150);
  }, [handleBarcodeScanned]);

  // Instant manual snapshot scan for tough, shiny, or faded barcodes
  const handleManualScanSnapshot = async () => {
    const videoEl = document.querySelector('#qr-reader-container video') as HTMLVideoElement | null;
    if (!videoEl || videoEl.readyState < 2) {
      alert('Kamera belum siap. Arahkan kamera ke barcode lalu coba lagi.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      // 1. Try native BarcodeDetector on high-res canvas
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector();
          const hits = await detector.detect(canvas);
          if (hits && hits.length > 0 && hits[0]?.rawValue) {
            handleBarcodeScanned(hits[0].rawValue);
            return;
          }
        } catch {
          // ignore
        }
      }

      // 2. Try Html5Qrcode on high-res canvas blob
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'snap.jpg', { type: 'image/jpeg' });
        try {
          const scanner = new Html5Qrcode('qr-reader-container', {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.CODABAR,
              Html5QrcodeSupportedFormats.ITF,
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.DATA_MATRIX,
            ],
            verbose: false,
          });
          const text = await scanner.scanFile(file, true);
          if (text) {
            handleBarcodeScanned(text);
          } else {
            alert('Barcode belum terbaca. Coba nyalakan tombol Senter 🔦, dekatkan ke jarak 15 cm, atau gunakan tombol "Foto Barcode HP" di bawah.');
          }
        } catch {
          alert('Barcode belum terbaca. Coba nyalakan tombol Senter 🔦, dekatkan ke jarak 15 cm, atau gunakan tombol "Foto Barcode HP" di bawah.');
        }
      }, 'image/jpeg', 0.95);
    } catch (e) {
      console.warn('Manual scan error:', e);
    }
  };

  // Decode barcode directly from captured photo file or gallery
  const handleQrPhotoFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-container', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      const decodedText = await html5QrCode.scanFile(file, true);
      if (decodedText) {
        handleBarcodeScanned(decodedText);
      }
    } catch (scanErr) {
      console.warn('Barcode not found in photo:', scanErr);
      alert('Barcode tidak terbaca dari foto tersebut. Pastikan foto terang, jelas, dan garis barcode tidak terpotong.');
    }
  };

  // Touch pinch-to-zoom gesture handlers on camera viewfinder
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistRef.current;
      const newZ = Math.max(zoomRangeRef.current.min, Math.min(zoomRangeRef.current.max, touchStartZoomRef.current * factor));
      applyZoom(newZ);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  // Switch tabs & start/stop corresponding camera
  useEffect(() => {
    if (!isOpen) {
      stopLiveCamera();
      stopQrScanner();
      setImagePreview(null);
      setAiResult(null);
      setAiError(null);
      setMatchedProducts([]);
      setAiMatchedProduct(null);
      setLastAiVoucherData(null);
      setScannedCode(null);
      setBarcodeMatchedProduct(null);
      setCardVoucherForm(null);
      setSaveSuccessMessage(null);
      return;
    }

    if (activeTab === 'ai_vision') {
      stopQrScanner();
      setBarcodeMatchedProduct(null);
      if (!imagePreview && !cardVoucherForm && !aiMatchedProduct) {
        startLiveCamera(cameraFacing);
      }
    } else if (activeTab === 'qr_barcode') {
      stopLiveCamera();
      setAiMatchedProduct(null);
      if (!cardVoucherForm && !barcodeMatchedProduct) {
        startQrScanner();
      }
    }

    return () => {
      stopLiveCamera();
      stopQrScanner();
    };
  }, [isOpen, activeTab, cameraFacing, imagePreview, cardVoucherForm, barcodeMatchedProduct, aiMatchedProduct]);

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
    // Optimized card/product photo thumbnail (< 50KB) to ensure Firestore safety
    const safeProductPhoto = await resizeImage(rawBase64, 480, 480, 0.7);

    // Process with AI
    await analyzeVoucherWithAi(compressedBase64, 'image/jpeg', safeProductPhoto);
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
      const safeProductPhoto = await resizeImage(rawBase64, 480, 480, 0.7);
      await analyzeVoucherWithAi(compressedBase64, file.type || 'image/jpeg', safeProductPhoto);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle changing photo on card from gallery/file
  const handleCardPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawBase64 = event.target?.result as string;
      if (rawBase64 && cardVoucherForm) {
        const safeCompressed = await compressImage(rawBase64, 480, 480, 0.7);
        setCardVoucherForm({ ...cardVoucherForm, imageUrl: safeCompressed });
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
      imageUrl: rawImage,
      sku: `VCR-${(data.provider || 'DATA').slice(0, 4).toUpperCase()}${data.quotaGigabytes ? `${data.quotaGigabytes}GB` : Date.now().toString().slice(-4)}`,
      category: 'Pulsa',
      isBarcodeItem: false,
    };

    setLastAiVoucherData(voucherCardData);

    // Check if matching product already exists in Data Master
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
      if (hasQuota && (pCat.includes('pulsa') || pCat.includes('voucher') || pName.includes('voucher') || pName.includes('gb'))) return true;
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

    // If voucher ALREADY EXISTS in Data Master:
    if (matches.length > 0) {
      if (onSelectProduct && sourceContext === 'pos') {
        playBeep();
        onSelectProduct(matches[0]);
        onClose();
        return;
      }
      // Show "Voucher / Barang Sudah Ada di Data Master" card!
      setAiMatchedProduct(matches[0]);
      setCardVoucherForm(null);
      return;
    }

    // If voucher NOT YET in Data Master: recommend input to master!
    setAiMatchedProduct(null);
    setCardVoucherForm(voucherCardData);
  };

  // USER REQUIREMENT: Save directly to Data Master in 1 Step
  const handleSaveMasterProduct = async () => {
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
        // Enforce strict size check (< 50KB) so Firestore NEVER exceeds the 1MB document limit
        finalImageUrl = await compressImage(finalImageUrl, 480, 480, 0.7);
        try {
          const cRes = await uploadToCloudinary(finalImageUrl, {
            cloudName: settings.cloudinaryCloudName,
            uploadPreset: settings.cloudinaryUploadPreset,
          });
          if (cRes.success && cRes.url) {
            finalImageUrl = cRes.url;
          } else if (cRes.url && cRes.url.startsWith('data:image/')) {
            finalImageUrl = cRes.url;
          }
        } catch (uploadErr) {
          console.warn('Cloudinary upload warning:', uploadErr);
        }
      }

      const savedProductName = cardVoucherForm.name.trim();

      // Save to Firestore / Data Master in 1 single step!
      await addProduct({
        name: savedProductName,
        category: cardVoucherForm.category || (cardVoucherForm.isBarcodeItem ? 'Sembako' : 'Pulsa'),
        sku: cardVoucherForm.sku || (cardVoucherForm.isBarcodeItem ? `BAR-${Date.now()}` : `VCR-${Date.now().toString().slice(-4)}`),
        price: Number(cardVoucherForm.price) || 0,
        cost: Number(cardVoucherForm.cost) || 0,
        stock: Number(cardVoucherForm.stock) || 0,
        minStock: 2,
        unit: 'Pcs',
        isFuel: false,
        imageUrl: finalImageUrl,
        provider: cardVoucherForm.provider || undefined,
        quota: cardVoucherForm.quota || undefined,
        validity: cardVoucherForm.validity || undefined,
      });

      // Notify parent that product has been saved directly to master
      if (onProductSaved) {
        onProductSaved(savedProductName);
      }

      playBeep();
      setSaveSuccessMessage(`✓ Berhasil menyimpan "${savedProductName}" ke Data Master!`);

      setTimeout(() => {
        setIsSavingMasterProduct(false);
        setCardVoucherForm(null);
        setImagePreview(null);
        setAiResult(null);
        onClose();
      }, 1000);
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
                  ? 'Scan kartu kuota, isi modal, jual, & stok, lalu simpan'
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

        {/* Tab Selector (Hidden if card form or matched product is active) */}
        {!cardVoucherForm && !barcodeMatchedProduct && !aiMatchedProduct && (
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
          {/* KONDISI 1: BARANG SUDAH ADA DI DATA MASTER (HASIL SCAN BARCODE)     */}
          {/* =================================================================== */}
          {barcodeMatchedProduct ? (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 sm:p-5 space-y-4 animate-in zoom-in-95">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-emerald-900">Barang Sudah Ada di Data Master!</h4>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                      Terdaftar
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Kode barcode <b>"{barcodeMatchedProduct.sku || scannedCode}"</b> telah terdaftar dalam sistem.
                  </p>
                </div>
              </div>

              {/* Tampilan Kartu Barang */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4 text-left">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 shadow-xs flex items-center justify-center">
                  {barcodeMatchedProduct.imageUrl ? (
                    <img
                      src={barcodeMatchedProduct.imageUrl}
                      alt={barcodeMatchedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-10 h-10 text-slate-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5 w-full">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[10px] font-bold rounded-md">
                      {barcodeMatchedProduct.category}
                    </span>
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-[10px] font-bold rounded-md font-mono">
                      Barcode: {barcodeMatchedProduct.sku || scannedCode}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 leading-snug">
                    {barcodeMatchedProduct.name}
                  </h3>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Harga Jual</span>
                      <span className="font-black text-teal-700 text-xs sm:text-sm">{formatRupiah(barcodeMatchedProduct.price)}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Modal (HPP)</span>
                      <span className="font-bold text-slate-700 text-xs sm:text-sm">{formatRupiah(barcodeMatchedProduct.cost)}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Stok</span>
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">{barcodeMatchedProduct.stock} {barcodeMatchedProduct.unit || 'Pcs'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                {onSelectProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProduct(barcodeMatchedProduct);
                      onClose();
                    }}
                    className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Pilih Barang ke Kasir</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeMatchedProduct(null);
                    setScannedCode(null);
                    startQrScanner();
                  }}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500" />
                  <span>Scan Barcode Lain</span>
                </button>
              </div>
            </div>
          ) : aiMatchedProduct ? (
            /* =================================================================== */
            /* KONDISI 2: VOUCHER SUDAH ADA DI DATA MASTER (HASIL AI VISION)       */
            /* =================================================================== */
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 sm:p-5 space-y-4 animate-in zoom-in-95">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-emerald-900">Voucher Sudah Ada di Data Master!</h4>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                      Sudah Ada
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Voucher hasil scan ini cocok dengan barang yang sudah terdaftar di Data Master.
                  </p>
                </div>
              </div>

              {/* Tampilan Kartu Voucher yang Ditemukan */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4 text-left">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 shadow-xs flex items-center justify-center">
                  {aiMatchedProduct.imageUrl ? (
                    <img
                      src={aiMatchedProduct.imageUrl}
                      alt={aiMatchedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Foto Scan"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Sparkles className="w-10 h-10 text-amber-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5 w-full">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {aiMatchedProduct.provider && (
                      <span className="px-2 py-0.5 bg-white text-teal-800 font-bold rounded-md border border-teal-200 text-[10px]">
                        📶 {aiMatchedProduct.provider}
                      </span>
                    )}
                    {aiMatchedProduct.quota && (
                      <span className="px-2 py-0.5 bg-white text-teal-900 font-extrabold rounded-md border border-teal-200 text-[10px]">
                        ⚡ {aiMatchedProduct.quota}
                      </span>
                    )}
                    {aiMatchedProduct.validity && (
                      <span className="px-2 py-0.5 bg-white text-amber-800 font-bold rounded-md border border-amber-200 text-[10px]">
                        ⏳ {aiMatchedProduct.validity}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-900 leading-snug">
                    {aiMatchedProduct.name}
                  </h3>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Harga Jual</span>
                      <span className="font-black text-teal-700 text-xs sm:text-sm">{formatRupiah(aiMatchedProduct.price)}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Modal (HPP)</span>
                      <span className="font-bold text-slate-700 text-xs sm:text-sm">{formatRupiah(aiMatchedProduct.cost)}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Stok</span>
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">{aiMatchedProduct.stock} Pcs</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col gap-2">
                {onSelectProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProduct(aiMatchedProduct);
                      onClose();
                    }}
                    className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Pilih Voucher ke Kasir</span>
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAiMatchedProduct(null);
                      setImagePreview(null);
                      setAiResult(null);
                      startLiveCamera(cameraFacing);
                    }}
                    className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    <span>Foto / Scan Ulang</span>
                  </button>
                  {lastAiVoucherData && (
                    <button
                      type="button"
                      onClick={() => {
                        setAiMatchedProduct(null);
                        setCardVoucherForm(lastAiVoucherData);
                      }}
                      className="flex-1 py-2.5 px-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-teal-600" />
                      <span>Tambah Sebagai Baru</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : cardVoucherForm ? (
            /* =================================================================== */
            /* KONDISI 3: BELUM ADA DI DATA MASTER - FORM INPUT KE MASTER          */
            /* =================================================================== */
            <div className="bg-white rounded-2xl border border-teal-100 shadow-xs p-4 sm:p-5 space-y-4 animate-in zoom-in-95">
              
              {/* Header Kartu */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                    {cardVoucherForm.isBarcodeItem ? <ScanLine className="w-4 h-4 text-teal-700" /> : <Sparkles className="w-4 h-4 text-teal-700" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {cardVoucherForm.isBarcodeItem ? 'Tambah Barang Baru (Barcode)' : 'Kartu Tambah Voucher Master'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {cardVoucherForm.isBarcodeItem 
                        ? 'Lengkapi info barang & foto produk (opsional), lalu klik Simpan'
                        : 'Periksa nama, input modal, jual & jumlah, lalu klik Simpan'}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  cardVoucherForm.isBarcodeItem 
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {cardVoucherForm.isBarcodeItem ? 'Barcode Baru' : 'Hasil AI Terbaca'}
                </span>
              </div>

              {/* Status Banner Belum Terdaftar */}
              {cardVoucherForm.isBarcodeItem ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    Barang dengan barcode <b>"{cardVoucherForm.sku}"</b> belum ada di Data Master. Silakan lengkapi data untuk mendaftarkannya:
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-2.5 text-xs text-teal-900">
                  <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                  <div>
                    Voucher belum ada di Data Master. Rekomendasi input ke Master berdasarkan hasil scan AI:
                  </div>
                </div>
              )}

              {/* 1. Foto Produk: Opsional untuk Barcode, Kamera/Upload untuk Voucher */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    {cardVoucherForm.isBarcodeItem ? 'Foto Produk (Opsional)' : 'Foto Voucher'}
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {cardVoucherForm.isBarcodeItem ? 'Boleh dikosongkan atau lampirkan foto' : 'Dari foto scan atau ambil file'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-300 shadow-inner flex items-center justify-center">
                    {cardVoucherForm.imageUrl ? (
                      <img
                        src={cardVoucherForm.imageUrl}
                        alt="Foto Barang"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full text-left">
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {cardVoucherForm.imageUrl 
                        ? 'Foto produk telah terpasang. Anda dapat mengganti atau menghapusnya.' 
                        : (cardVoucherForm.isBarcodeItem 
                            ? 'Lampirkan foto produk dari kamera atau galeri HP (opsional).' 
                            : 'Foto voucher hasil scan kamera siap disimpan.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => cardPhotoCameraInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Kamera HP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => cardPhotoFileInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Galeri</span>
                      </button>
                      {cardVoucherForm.imageUrl && cardVoucherForm.isBarcodeItem && (
                        <button
                          type="button"
                          onClick={() => setCardVoucherForm({ ...cardVoucherForm, imageUrl: '' })}
                          className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Hapus Foto
                        </button>
                      )}
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
                <input
                  type="file"
                  ref={cardPhotoCameraInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleCardPhotoChange}
                  className="hidden"
                />
              </div>

              {/* Barcode & Kategori */}
              {cardVoucherForm.isBarcodeItem ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kode Barcode (SKU)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={cardVoucherForm.sku}
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kategori Produk *
                    </label>
                    <select
                      value={cardVoucherForm.category}
                      onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs"
                    >
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                /* Badge ringkasan voucher */
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
              )}

              {/* 2. Nama Barang / Voucher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Barang *
                </label>
                <input
                  type="text"
                  required
                  value={cardVoucherForm.name}
                  onChange={(e) => setCardVoucherForm({ ...cardVoucherForm, name: e.target.value })}
                  placeholder={cardVoucherForm.isBarcodeItem ? 'Contoh: Indomie Goreng 85g, Kopi Kapal Api...' : 'Contoh: Voucher Tri 10 GB 3 Hari'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500 font-bold text-slate-900 text-sm"
                />
              </div>

              {/* 3. Inputan Modal & Jual */}
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

              {/* 5. Tombol Simpan */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={isSavingMasterProduct}
                  onClick={handleSaveMasterProduct}
                  className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {isSavingMasterProduct ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCardVoucherForm(null);
                    setImagePreview(null);
                    setAiResult(null);
                    setScannedCode(null);
                    if (activeTab === 'ai_vision') {
                      startLiveCamera(cameraFacing);
                    } else {
                      startQrScanner();
                    }
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
                      <span className="font-bold">Scan Barcode / QR Code:</span> Arahkan kamera ke barcode produk fisik atau kemasan. Sistem akan langsung membaca dan mendeteksi barcode secara instan.
                    </div>
                  </div>

                  {/* Viewfinder container dengan gesture pinch-to-zoom */}
                  <div 
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 max-w-sm mx-auto flex items-center justify-center shadow-md border border-slate-800 touch-none"
                  >
                    <div id="qr-reader-container" className="w-full h-full" />

                    {isQrScanning && (
                      <>
                        {/* Status Zoom & Torch Bar (Top Overlay) */}
                        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10 pointer-events-auto">
                          <div className="px-2.5 py-1 bg-black/75 backdrop-blur-md text-white rounded-xl text-xs font-bold border border-white/10 flex items-center gap-1.5 shadow-sm">
                            <Focus className="w-3.5 h-3.5 text-teal-400" />
                            <span>Zoom: {zoomLevel.toFixed(1)}x</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isTorchAvailable && (
                              <button
                                type="button"
                                onClick={toggleTorch}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border shadow-sm transition cursor-pointer ${
                                  isTorchOn
                                    ? 'bg-amber-500 text-white border-amber-300 ring-2 ring-amber-300'
                                    : 'bg-black/75 text-slate-300 border-white/10 hover:bg-black/90'
                                }`}
                              >
                                <Flashlight className="w-3.5 h-3.5" />
                                <span>{isTorchOn ? 'Senter ON' : 'Senter'}</span>
                              </button>
                            )}

                            <div className="px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-black/75 text-emerald-300 border border-emerald-500/30 backdrop-blur-md shadow-sm">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Sensitif</span>
                            </div>
                          </div>
                        </div>

                        {/* Viewfinder Reticle & Laser */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center">
                          <div className="w-64 h-36 border-2 border-teal-400/90 rounded-2xl relative shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-teal-400" />
                            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-teal-400" />
                            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-3 border-b-3 border-teal-400" />
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-3 border-b-3 border-teal-400" />
                            <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_red] animate-pulse mt-18" />
                          </div>
                          
                          <div className="mt-2.5 text-center px-2">
                            <span className="px-2.5 py-0.5 bg-black/75 text-teal-300 text-[10px] font-bold rounded-full backdrop-blur-xs">
                              Arahkan Garis Merah ke Garis Barcode
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* TOMBOL SCAN INSTAN CEPAT */}
                  <div className="max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={handleManualScanSnapshot}
                      className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer"
                    >
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>⚡ Jepret & Scan Barcode Sekarang</span>
                    </button>
                  </div>

                  {/* KONTROL ZOOM CEPAT & PRESET (MENGATASI KAMERA BLUR PADA BARCODE KECIL) */}
                  <div className="bg-slate-900 text-white p-3 rounded-2xl border border-slate-800 space-y-2.5 shadow-sm max-w-sm mx-auto">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200">
                        <ZoomIn className="w-3.5 h-3.5 text-teal-400" />
                        <span>Pilihan Zoom Barcode:</span>
                      </div>
                      <span className="text-[10px] text-teal-300 font-semibold font-mono">
                        {zoomLevel.toFixed(1)}x
                      </span>
                    </div>

                    {/* Tombol Preset Zoom: 1.0x, 1.5x, 2.0x, 3.0x */}
                    <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => applyZoom(1.0)}
                        className={`py-2 px-1 rounded-xl text-center transition cursor-pointer border ${
                          Math.abs(zoomLevel - 1.0) < 0.1
                            ? 'bg-teal-600 text-white border-teal-400 shadow-xs ring-1 ring-teal-400'
                            : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-750'
                        }`}
                      >
                        1.0x
                        <span className="block text-[9px] font-normal text-slate-400">Jauh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyZoom(1.5)}
                        className={`py-2 px-1 rounded-xl text-center transition cursor-pointer border ${
                          Math.abs(zoomLevel - 1.5) < 0.1
                            ? 'bg-teal-600 text-white border-teal-400 shadow-xs ring-1 ring-teal-400'
                            : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-750'
                        }`}
                      >
                        1.5x
                        <span className="block text-[9px] font-normal text-slate-400">Standar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyZoom(2.0)}
                        className={`py-2 px-1 rounded-xl text-center transition cursor-pointer border ${
                          Math.abs(zoomLevel - 2.0) < 0.1
                            ? 'bg-teal-600 text-white border-teal-400 shadow-xs ring-1 ring-teal-400'
                            : 'bg-slate-800/90 text-teal-300 border-teal-800/60 hover:bg-slate-750'
                        }`}
                      >
                        2.0x ★
                        <span className="block text-[9px] font-semibold text-teal-400">Kecil</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyZoom(3.0)}
                        className={`py-2 px-1 rounded-xl text-center transition cursor-pointer border ${
                          Math.abs(zoomLevel - 3.0) < 0.1
                            ? 'bg-teal-600 text-white border-teal-400 shadow-xs ring-1 ring-teal-400'
                            : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-750'
                        }`}
                      >
                        3.0x
                        <span className="block text-[9px] font-normal text-slate-400">Mini</span>
                      </button>
                    </div>

                    {/* Slider Halus untuk Fine-Tuning */}
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyZoom(Math.max(zoomRangeRef.current.min, zoomLevel - 0.2))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 shrink-0 cursor-pointer"
                        title="Perkecil Zoom"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="range"
                        min={zoomRangeRef.current.min}
                        max={zoomRangeRef.current.max}
                        step="0.1"
                        value={zoomLevel}
                        onChange={(e) => applyZoom(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
                      />

                      <button
                        type="button"
                        onClick={() => applyZoom(Math.min(zoomRangeRef.current.max, zoomLevel + 0.2))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 shrink-0 cursor-pointer"
                        title="Perbesar Zoom"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>

                      <span className="text-[11px] font-mono font-bold text-teal-300 w-9 text-right shrink-0">
                        {zoomLevel.toFixed(1)}x
                      </span>
                    </div>
                  </div>

                  {/* KOTAK SOLUSI & TIPS ANTI-BLUR */}
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3 text-xs text-amber-900 space-y-1 max-w-sm mx-auto">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <span>💡 Tips Barcode Kecil Agar Tidak Blur:</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Jaga jarak kamera sekitar <b>15–20 cm</b> (jangan terlalu dekat agar lensa HP tidak blur), lalu pilih <b>Zoom 2.0x / 3.0x</b> agar kode terbaca jernih dan tajam.
                    </p>
                  </div>

                  {/* Pilihan Alternatif Foto / Galeri */}
                  <div className="flex items-center justify-center gap-2 max-w-sm mx-auto pt-1">
                    <button
                      type="button"
                      onClick={() => qrFallbackCameraInputRef.current?.click()}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-teal-600" />
                      <span>Foto Barcode HP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => qrFallbackFileInputRef.current?.click()}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Unggah File</span>
                    </button>
                  </div>

                  {/* Hidden inputs for QR photo scan fallback */}
                  <input
                    ref={qrFallbackFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQrPhotoFileScan}
                    className="hidden"
                  />
                  <input
                    ref={qrFallbackCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleQrPhotoFileScan}
                    className="hidden"
                  />

                  {/* QR scanner error */}
                  {qrError && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-2.5 max-w-sm mx-auto">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div>
                          <div className="font-bold">Kendala Akses Kamera</div>
                          <div className="mt-0.5 leading-relaxed text-[11px]">{qrError}</div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setQrError(null);
                            startQrScanner();
                          }}
                          className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Coba Buka Kamera Langsung Lagi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => qrFallbackCameraInputRef.current?.click()}
                          className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-teal-600" />
                          <span>Ambil Foto Barcode (Kamera Bawaan HP)</span>
                        </button>
                      </div>
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

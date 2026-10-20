import { compressImage } from './imageCompressor';

// Cloudinary Upload & Configuration Utilities for CatatUsaha

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  apiKey?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  notConfigured?: boolean;
  error?: string;
  source?: 'cloudinary_server' | 'cloudinary_preset' | 'client_direct' | 'fallback_local';
}

const STORAGE_KEY = 'catatusaha_cloudinary_config';

/**
 * Get Cloudinary config from localStorage or fallback
 */
export function getLocalCloudinaryConfig(): CloudinaryConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to read Cloudinary config from localStorage', e);
  }
  return { cloudName: 'cqwosuvb', uploadPreset: '' };
}

/**
 * Save Cloudinary config to localStorage
 */
export function setLocalCloudinaryConfig(config: CloudinaryConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save Cloudinary config to localStorage', e);
  }
}

/**
 * Upload an image (base64 data URI) to Cloudinary.
 * Tries server endpoint first, then direct unsigned client upload, then falls back gracefully.
 * ALWAYS ensures the image is compressed so it never exceeds Firestore size limits.
 */
export async function uploadToCloudinary(
  rawImageBase64: string,
  preferredConfig?: Partial<CloudinaryConfig>
): Promise<UploadResult> {
  // Compress to ultra-lightweight size first (< 50KB)
  const imageBase64 = rawImageBase64.startsWith('data:image/')
    ? await compressImage(rawImageBase64, 480, 480, 0.7)
    : rawImageBase64;

  const localConfig = getLocalCloudinaryConfig();
  const cloudName = (preferredConfig?.cloudName || localConfig.cloudName || '').trim();
  const uploadPreset = (preferredConfig?.uploadPreset || localConfig.uploadPreset || '').trim();

  try {
    // 1. Try server proxy endpoint if available
    let data: any = {};
    try {
      const response = await fetch('/api/cloudinary/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          cloudName,
          uploadPreset,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
        if (response.ok && data.success && data.url) {
          return {
            success: true,
            url: data.url,
            publicId: data.publicId,
            source: data.source || 'cloudinary_server',
          };
        }
      }
    } catch (serverErr) {
      console.warn('Server Cloudinary endpoint unavailable, proceeding to client upload:', serverErr);
    }

    // If server responded with notConfigured and we have client-side cloudName + uploadPreset
    if (cloudName && uploadPreset) {
      const clientRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: imageBase64,
          upload_preset: uploadPreset,
          folder: 'catatusaha_products',
        }),
      });

      const clientData = await clientRes.json();
      if (clientRes.ok && clientData.secure_url) {
        return {
          success: true,
          url: clientData.secure_url,
          publicId: clientData.public_id,
          source: 'client_direct',
        };
      }
    }

    if (data.notConfigured) {
      return {
        success: false,
        notConfigured: true,
        error: 'Cloudinary belum dikonfigurasi. Gambar disimpan sementara secara lokal.',
        url: imageBase64, // Fallback so image isn't lost
        source: 'fallback_local',
      };
    }

    return {
      success: false,
      error: data.error || 'Gagal mengupload gambar ke Cloudinary.',
      url: imageBase64,
      source: 'fallback_local',
    };
  } catch (err: any) {
    console.error('Error in uploadToCloudinary:', err);
    return {
      success: false,
      error: err.message || 'Koneksi ke Cloudinary terputus.',
      url: imageBase64,
      source: 'fallback_local',
    };
  }
}

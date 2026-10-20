/**
 * Image compression and optimization utility for CatatUsaha.
 * Enforces strict size limits so no image exceeds Firestore's 1 MiB (1,048,576 bytes) limit.
 * Typical compressed output is ~25 KB - 50 KB, crisp for product cards, vouchers, and POS icons.
 */

export async function compressImage(
  dataUrlOrFile: string,
  maxWidth = 480,
  maxHeight = 480,
  quality = 0.7
): Promise<string> {
  if (!dataUrlOrFile) return '';
  
  // If already a remote URL (e.g. Cloudinary, Firebase Storage, HTTP)
  if (!dataUrlOrFile.startsWith('data:image/')) {
    return dataUrlOrFile;
  }

  // If already very compact (under 40 KB, base64 length < 55,000 chars)
  if (dataUrlOrFile.length < 55000) {
    return dataUrlOrFile;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width || 480;
          let height = img.height || 480;

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
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrlOrFile);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, width, height);

          let output = canvas.toDataURL('image/jpeg', quality);

          // If still larger than 120 KB, step down quality to 0.5
          if (output.length > 160000) {
            output = canvas.toDataURL('image/jpeg', 0.5);
          }

          // If STILL larger than 150 KB, downscale dimensions
          if (output.length > 200000) {
            const smallCanvas = document.createElement('canvas');
            const sw = Math.max(1, Math.round(width * 0.6));
            const sh = Math.max(1, Math.round(height * 0.6));
            smallCanvas.width = sw;
            smallCanvas.height = sh;
            const sCtx = smallCanvas.getContext('2d');
            if (sCtx) {
              sCtx.drawImage(canvas, 0, 0, sw, sh);
              output = smallCanvas.toDataURL('image/jpeg', 0.5);
            }
          }

          resolve(output);
        } catch (e) {
          console.warn('Canvas compression error:', e);
          resolve(dataUrlOrFile);
        }
      };
      img.onerror = (err) => {
        console.warn('Image load error during compression:', err);
        resolve(dataUrlOrFile);
      };
      img.src = dataUrlOrFile;
    } catch (err) {
      console.warn('compressImage exception:', err);
      resolve(dataUrlOrFile);
    }
  });
}

/**
 * Validates that a base64 string is safe for Firestore storage (< 400 KB).
 * If it's too large, attempts emergency re-compression.
 */
export async function ensureSafeForFirestore(imageUrl: string | undefined): Promise<string> {
  if (!imageUrl) return '';
  if (!imageUrl.startsWith('data:image/')) return imageUrl;

  // 400 KB in base64 is ~550,000 chars. Firestore max is 1,048,576 bytes.
  if (imageUrl.length > 400000) {
    return await compressImage(imageUrl, 360, 360, 0.55);
  }
  return imageUrl;
}

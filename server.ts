import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

// Ensure Vite HMR is disabled in cloud container proxy environment
process.env.DISABLE_HMR = 'true';

// Configure Cloudinary from environment or defaults
const defaultCloudName = process.env.CLOUDINARY_CLOUD_NAME || 'cqwosuvb';
const defaultApiKey = process.env.CLOUDINARY_API_KEY || '647282724887793';

if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
} else {
  cloudinary.config({
    cloud_name: defaultCloudName,
    api_key: defaultApiKey,
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
    secure: true,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Accept larger payloads for base64 images from camera
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  // Endpoint to scan voucher/kuota perdana using Gemini Multimodal Vision
  app.post('/api/gemini/scan-voucher', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', geminiApiKey } = req.body;
      const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Data gambar (base64) diperlukan.' });
      }

      const requestAi = effectiveApiKey
        ? new GoogleGenAI({
            apiKey: effectiveApiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          })
        : ai;

      if (!requestAi) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY belum dikonfigurasi. Masukkan Gemini API Key di Pengaturan Usaha atau environment Vercel.',
        });
      }

      // Clean base64 string if it contains data URI prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

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
     * "25/30" -> Kuota: 25 GB, Masa Aktif: 30 Hari
     * "6/5" -> Kuota: 6 GB, Masa Aktif: 5 Hari
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
     * "Voucher Smartfren 6 GB 5 Hari"

4. HARGA MODAL & JUAL:
   - Jika ada tulisan harga spidol (misal: "m18" / "j22" / "22k"), ekstrak angka modal dan jualnya. Jika tidak ada, isi 0.

Kembalikan HANYA format JSON murni tanpa markdown triple backticks atau format lain:
{
  "provider": "Nama Provider (misal: Tri / Telkomsel / Indosat / Axis / XL / Smartfren)",
  "quota": "10 GB",
  "quotaGigabytes": 10,
  "validityDays": "3 Hari",
  "handwrittenNote": "10/3",
  "productName": "Voucher Tri 10 GB 3 Hari",
  "searchKeyword": "Tri 10 GB",
  "suggestedCost": 0,
  "suggestedPrice": 0,
  "detectedText": "Ringkasan tulisan cetak atau catatan spidol yang terlihat pada gambar"
}`;

      // Source of truth models per gemini-api skill for fast vision processing
      const modelsToTry = [
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ];
      let lastError: any = null;
      let response: any = null;

      for (const modelName of modelsToTry) {
        try {
          response = await requestAi.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            config: {
              temperature: 0.1,
              maxOutputTokens: 600,
            },
          });
          if (response && response.text) {
            break;
          }
        } catch (mErr: any) {
          lastError = mErr;
          console.warn(`Model ${modelName} failed, trying next model:`, mErr?.message?.slice(0, 80));
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error('Tidak ada respon dari model AI');
      }

      const responseText = response.text || '';
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({
          success: true,
          data: parsed,
          raw: responseText,
        });
      }

      return res.json({
        success: true,
        data: {
          provider: 'Tidak terdeteksi',
          quota: '',
          quotaGigabytes: 0,
          validityDays: '',
          handwrittenNote: '',
          productName: '',
          searchKeyword: '',
          suggestedCost: 0,
          suggestedPrice: 0,
          detectedText: responseText.slice(0, 200),
        },
        raw: responseText,
      });
    } catch (err: any) {
      console.error('Error in /api/gemini/scan-voucher:', err);
      let errMsg = 'Gagal menganalisis gambar voucher dengan AI.';
      if (err?.message?.includes('503') || err?.message?.includes('high demand')) {
        errMsg = 'Layanan AI sedang sibuk sementara. Silakan tekan ambil foto ulang beberapa detik lagi.';
      } else if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch {
          errMsg = err.message;
        }
      }
      return res.status(500).json({
        error: errMsg,
      });
    }
  });

  // Cloudinary Upload Endpoint
  app.post('/api/cloudinary/upload', async (req, res) => {
    try {
      const { imageBase64, cloudName, uploadPreset } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Data gambar (base64) diperlukan.' });
      }

      // Check if server environment has signed Cloudinary credentials or request body has api_key / secret
      const reqApiKey = req.body.apiKey;
      const reqApiSecret = req.body.apiSecret;
      const reqCloudName = req.body.cloudName || process.env.CLOUDINARY_CLOUD_NAME;
      const reqUploadPreset = req.body.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET;

      const effectiveApiKey = reqApiKey || process.env.CLOUDINARY_API_KEY;
      const effectiveApiSecret = reqApiSecret || process.env.CLOUDINARY_API_SECRET;
      const effectiveCloudName = reqCloudName;

      if (effectiveCloudName && effectiveApiKey && effectiveApiSecret) {
        // Configure on the fly if needed
        cloudinary.config({
          cloud_name: effectiveCloudName,
          api_key: effectiveApiKey,
          api_secret: effectiveApiSecret,
          secure: true,
        });

        const uploadResult = await cloudinary.uploader.upload(imageBase64, {
          folder: 'catatusaha_products',
          resource_type: 'image',
        });
        return res.json({
          success: true,
          url: uploadResult.secure_url || uploadResult.url,
          publicId: uploadResult.public_id,
          source: 'cloudinary_server_signed',
        });
      }

      const hasServerSigned = Boolean(
        process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
      );

      if (hasServerSigned) {
        const uploadResult = await cloudinary.uploader.upload(imageBase64, {
          folder: 'catatusaha_products',
          resource_type: 'image',
        });
        return res.json({
          success: true,
          url: uploadResult.secure_url || uploadResult.url,
          publicId: uploadResult.public_id,
          source: 'cloudinary_server',
        });
      }

      // If client supplied cloudName & uploadPreset or env has CLOUDINARY_CLOUD_NAME / PRESET
      const targetCloud = (cloudName || process.env.CLOUDINARY_CLOUD_NAME || '').trim();
      const targetPreset = (uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || '').trim();

      if (targetCloud && targetPreset) {
        const cRes = await fetch(`https://api.cloudinary.com/v1_1/${targetCloud}/image/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: imageBase64,
            upload_preset: targetPreset,
            folder: 'catatusaha_products',
          }),
        });

        const cData = await cRes.json();
        if (cRes.ok && cData.secure_url) {
          return res.json({
            success: true,
            url: cData.secure_url,
            publicId: cData.public_id,
            source: 'cloudinary_preset',
          });
        }

        console.error('Cloudinary API error:', cData);
        return res.status(400).json({
          error: cData?.error?.message || 'Gagal upload ke Cloudinary. Periksa Cloud Name dan Upload Preset.',
        });
      }

      return res.status(400).json({
        notConfigured: true,
        error: 'Cloudinary belum dikonfigurasi. Masukkan Cloud Name & Upload Preset di Pengaturan Usaha.',
      });
    } catch (err: any) {
      console.error('Error in /api/cloudinary/upload:', err);
      return res.status(500).json({
        error: err.message || 'Gagal mengunggah gambar ke Cloudinary.',
      });
    }
  });

  // Cloudinary Status
  app.get('/api/cloudinary/status', (req, res) => {
    const hasEnv = Boolean(
      process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && (process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_UPLOAD_PRESET))
    );
    res.json({
      hasEnv,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      hasPreset: Boolean(process.env.CLOUDINARY_UPLOAD_PRESET),
    });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasCloudinary: Boolean(
        process.env.CLOUDINARY_URL || 
        (process.env.CLOUDINARY_CLOUD_NAME && (process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_UPLOAD_PRESET))
      ),
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

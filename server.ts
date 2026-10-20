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
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Data gambar (base64) diperlukan.' });
      }

      if (!ai) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY belum dikonfigurasi di server secrets.',
        });
      }

      // Clean base64 string if it contains data URI prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const prompt = `Anda adalah sistem AI Vision kasir & counter pulsa di Indonesia yang sangat ahli dan teliti dalam membaca fisik voucher kuota internet, kartu perdana, atau stiker/catatan label tulisan spidol voucher konter.
Tugas Anda adalah menganalisis gambar voucher/kartu perdana/catatan konter ini dan mengekstrak data berikut secara cerdas:

1. OPERATOR / PROVIDER:
   - Kenali nama provider dari logo resmi, tulisan cetak, warna kartu, maupun singkatan/tulisan tangan:
     * "Tri" / "3" / "Three"
     * "Telkomsel" / "Tsel" / "Simpati" / "AS" / "by.U"
     * "Indosat" / "IM3" / "Ooredoo"
     * "XL" / "XL Axiata"
     * "Axis" / "Aigo"
     * "Smartfren" / "SF"

2. TULISAN TANGAN / SPIDOL PENJUAL KONTER (SANGAT PENTING):
   - Di konter pulsa Indonesia, pemilik konter sering menuliskan ringkasan dengan SPIDOL di bagian depan atau belakang kartu/voucher, misalnya "10/3", "tri 10/3", "3/5", "1.5/3", "2/5", "5/7", "10/30".
     * Pola angka "X/Y" seperti "10/3": ARTINYA X = Kuota GB (10 GB), dan Y = Masa Aktif (3 Hari). Jadi "10/3" = Kuota 10 GB, Masa aktif 3 Hari!
     * Pola "3/5" = Kuota 3 GB, Masa aktif 5 Hari.
     * Pola "1.5/3" = Kuota 1.5 GB, Masa aktif 3 Hari.
     * Pola "10/30" = Kuota 10 GB, Masa aktif 30 Hari.
     * Catat tulisan spidol persis yang terbaca di field "handwrittenNote" (contoh: "10/3").
   - Jika terdapat harga modal atau harga jual yang ditulis spidol (misal: "m18" / "j22" / "22k"), ekstrak sebagai saran harga.
   - Bila voucher mencantumkan kuota cetak pabrik (misal "Total Kuota 10 GB"), gunakan itu sebagai acuan atau gabungkan dengan catatan spidol jika voucher merupakan injeksi kuota khusus.

3. NAMA PRODUK & KATA KUNCI DATA MASTER:
   - Buatkan nama produk yang rapi untuk pendaftaran di Data Master kasir, contoh:
     * "Voucher Tri 10 GB (3 Hari)"
     * "Voucher Tri 3 GB (5 Hari)"
     * "Voucher Indosat 10 GB (30 Hari)"
     * "Voucher Axis Aigo 2 GB (3 Hari)"
     * "Voucher Telkomsel 15 GB (30 Hari)"
   - Sediakan "searchKeyword" singkat untuk pencarian kasir (contoh: "Tri 10 GB" atau "Tri 3 GB").

Kembalikan HANYA format JSON murni tanpa markdown triple backticks:
{
  "provider": "Nama Provider (misal: Tri / Indosat / Telkomsel / Axis / XL / Smartfren)",
  "quota": "10 GB",
  "quotaGigabytes": 10,
  "validityDays": "3 Hari",
  "handwrittenNote": "10/3",
  "productName": "Voucher Tri 10 GB (3 Hari)",
  "searchKeyword": "Tri 10 GB",
  "suggestedCost": 0,
  "suggestedPrice": 0,
  "detectedText": "Ringkasan tulisan cetak atau catatan spidol yang terbaca pada gambar"
}`;

      const modelsToTry = [
        'gemini-3.8-flash',
        'gemini-flash-latest',
        'gemini-3.1-flash-lite'
      ];
      let lastError: any = null;
      let response: any = null;

      for (const modelName of modelsToTry) {
        try {
          response = await ai.models.generateContent({
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

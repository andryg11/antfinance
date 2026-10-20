import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

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

      const prompt = `Anda adalah sistem AI Vision kasir & counter pulsa di Indonesia yang sangat ahli dan teliti dalam membaca fisik voucher kuota internet, kartu perdana, atau brosur paket data.
Tugas Anda adalah menganalisis gambar voucher/kartu perdana ini dan menemukan:
1. Total Kuota atau Gigabyte (GB / MB) yang tertera jelas pada gambar (contoh: "10 GB", "15 GB", "3 GB", "24 GB", "50 GB", dsb).
2. Nama Provider operator telekomunikasi (contoh: "Telkomsel", "Indosat" / "IM3", "XL", "Axis", "Tri" / "3", "Smartfren").
3. Masa aktif jika ada (contoh: "30 Hari", "7 Hari", "14 Hari").
4. Kategori/Jenis (contoh: "Voucher Fisik", "Perdana Kuota", "Aigo", "Freedom", "Maxstream", dsb).
5. Kata kunci pencarian terbaik untuk kasir menemukan produk ini di data master (contoh: "Indosat 10 GB" atau "Telkomsel 15 GB").

Kembalikan HANYA format JSON murni tanpa markdown triple backticks:
{
  "provider": "Nama Provider (misal Indosat Ooredoo / Telkomsel / XL / Axis / Tri / Smartfren)",
  "quota": "Angka dan satuan kuota (misal '10 GB' atau '15 GB' atau '3 GB')",
  "quotaGigabytes": 10,
  "validityDays": "30 Hari",
  "productName": "Nama paket voucher yang tertera",
  "searchKeyword": "Kata kunci pencarian singkat (misal 'Indosat 10 GB')",
  "detectedText": "Ringkasan tulisan penting yang terbaca"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
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
          productName: '',
          searchKeyword: '',
          detectedText: responseText.slice(0, 200),
        },
        raw: responseText,
      });
    } catch (err: any) {
      console.error('Error in /api/gemini/scan-voucher:', err);
      return res.status(500).json({
        error: err.message || 'Gagal menganalisis gambar voucher dengan AI.',
      });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

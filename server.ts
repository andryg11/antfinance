import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

// Ensure Vite HMR is disabled in cloud container proxy environment
process.env.DISABLE_HMR = 'true';

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

      const prompt = `Anda adalah sistem AI Vision kasir & counter pulsa di Indonesia yang sangat ahli dan teliti dalam membaca fisik voucher kuota internet, kartu perdana, atau stiker/catatan label voucher konter.
Tugas Anda adalah menganalisis gambar voucher/kartu perdana/catatan konter ini dan mengekstrak data berikut secara cerdas:

1. OPERATOR / PROVIDER:
   - Kenali nama provider dari logo, tulisan resmi, maupun singkatan/tulisan tangan:
     * "Tri" / "3" / "Three"
     * "Telkomsel" / "Tsel" / "Simpati" / "AS" / "by.U"
     * "Indosat" / "IM3" / "Ooredoo"
     * "XL" / "XL Axiata"
     * "Axis" / "Aigo"
     * "Smartfren" / "SF"

2. KUOTA & MASA AKTIF (Termasuk Notasi Singkatan Konter Pulsa Indonesia):
   - Di konter pulsa Indonesia, penjual sering menuliskan singkatan spidol/label seperti "tri 3/5" atau "3/5", "1.5/3", "2/5", "5/7", "10/30".
     * Pola angka "X/Y" seperti "3/5" ARTINYA: X = Kuota GB (contoh 3 GB), dan Y = Masa Aktif Hari (contoh 5 Hari). Jadi "tri 3/5" = Provider Tri, Kuota 3 GB, Masa aktif 5 Hari!
     * Pola lain: "3gb 5hr", "2gb 3d", "10gb 30h", dsb.
   - Bila voucher mencantumkan kuota cetak (misal "Total Kuota 10 GB 30 Hari"), ambil kuota dan masa aktif tersebut.
   - Bila terdapat catatan tulisan tangan/spidol/label konter DAN juga tulisan cetak, pahami maksudnya secara utuh.

3. NAMA PRODUK & KATA KUNCI PENCARIAN:
   - Buat nama produk yang rapi dan terstandarisasi untuk data master kasir, contoh:
     * "Voucher Tri 3 GB (5 Hari)"
     * "Voucher Indosat 10 GB (30 Hari)"
     * "Voucher Axis Aigo 2 GB (3 Hari)"
     * "Voucher Telkomsel 15 GB (30 Hari)"
   - Sediakan "searchKeyword" singkat untuk memudahkan pencarian di Data Master kasir (contoh: "Tri 3 GB" atau "Indosat 10 GB").

Kembalikan HANYA format JSON murni tanpa markdown triple backticks:
{
  "provider": "Nama Provider (misal: Tri / Indosat / Telkomsel / Axis / XL / Smartfren)",
  "quota": "Angka dan satuan kuota (misal: '3 GB' atau '10 GB')",
  "quotaGigabytes": 3,
  "validityDays": "5 Hari",
  "productName": "Voucher Tri 3 GB (5 Hari)",
  "searchKeyword": "Tri 3 GB",
  "detectedText": "Ringkasan tulisan atau catatan yang terbaca pada gambar"
}`;

      const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
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
          productName: '',
          searchKeyword: '',
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

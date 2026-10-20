import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for cross-origin hosting environments
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg', geminiApiKey } = req.body || {};
    const effectiveApiKey =
      geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      '';

    if (!imageBase64) {
      return res.status(400).json({ error: 'Data gambar (base64) diperlukan.' });
    }

    if (!effectiveApiKey) {
      return res.status(500).json({
        error:
          'GEMINI_API_KEY belum dikonfigurasi di hosting. Masukkan Gemini API Key di Pengaturan Usaha atau environment Vercel.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey: effectiveApiKey,
    });

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
  "provider": "Nama Provider (misal: Tri / Telkomsel / Indosat / XL / Axis / Smartfren)",
  "quota": "Jumlah kuota (misal: 10 GB)",
  "quotaGigabytes": 10,
  "validityDays": "3 Hari",
  "handwrittenNote": "10/3 (atau tulisan spidol jika ada)",
  "productName": "Voucher Tri 10 GB 3 Hari",
  "searchKeyword": "Tri 10 GB",
  "suggestedCost": 0,
  "suggestedPrice": 0,
  "detectedText": "Ringkasan teks terbaca di kartu"
}`;

    const modelsToTry = [
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
    ];

    let lastError: any = null;
    let textResponse = '';

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
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
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          textResponse = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Vercel Serverless] Model ${modelName} failed, trying fallback:`, err?.message || err);
      }
    }

    if (!textResponse) {
      throw lastError || new Error('Gagal mendapatkan respons AI dari semua model.');
    }

    let parsedData: any = {};
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[0]);
    } else {
      parsedData = JSON.parse(textResponse);
    }

    return res.status(200).json({
      success: true,
      data: parsedData,
      rawText: textResponse,
    });
  } catch (error: any) {
    console.error('[Vercel Serverless] Scan voucher error:', error);
    return res.status(500).json({
      error: error.message || 'Gagal menganalisis gambar voucher.',
    });
  }
}

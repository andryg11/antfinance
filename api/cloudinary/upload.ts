import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageBase64, cloudName, uploadPreset } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'Data gambar (base64) diperlukan.' });
    }

    const targetCloud = cloudName || process.env.CLOUDINARY_CLOUD_NAME || 'cqwosuvb';
    const targetPreset = uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || '';

    if (!targetCloud) {
      return res.status(400).json({
        notConfigured: true,
        error: 'Cloudinary Cloud Name belum diisi.',
      });
    }

    // Direct upload to Cloudinary via HTTP API
    const cRes = await fetch(`https://api.cloudinary.com/v1_1/${targetCloud}/image/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: imageBase64,
        upload_preset: targetPreset || undefined,
        folder: 'catatusaha_products',
      }),
    });

    const cData = await cRes.json();
    if (cRes.ok && cData.secure_url) {
      return res.status(200).json({
        success: true,
        url: cData.secure_url,
        publicId: cData.public_id,
        source: 'cloudinary_serverless',
      });
    }

    return res.status(400).json({
      error: cData?.error?.message || 'Gagal upload ke Cloudinary. Periksa Cloud Name dan Upload Preset.',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Gagal mengunggah gambar ke Cloudinary.',
    });
  }
}

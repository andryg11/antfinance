import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
    platform: 'vercel-serverless',
    timestamp: new Date().toISOString(),
  });
}

import { json, type RequestHandler } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';

interface GeminiModelInfo {
  id: string;
  name: string;
  tag: string;
  badgeClass: string;
  description: string;
  category: 'frontier' | 'efficiency' | 'classic';
}

const CURATED_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tag: '🌟 Kuota 500 RPD (Rekomendasi Utama)',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    description: 'Model resmi Google dengan kuota harian TERBESAR (500 request/hari, 15 RPM). Tercepat, tanpa limit 20 RPD & bebas 503.',
    category: 'efficiency'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    tag: '⚡ Kuota 500 RPD',
    badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border-teal-300 dark:border-teal-800',
    description: 'Model generasi 3.1 dengan kuota harian besar (500 request/hari, 15 RPM). Sangat stabil.',
    category: 'efficiency'
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'Cepat & Stabil',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
    description: 'Memberikan kecepatan tinggi dan performa handal (20 request/hari, 5 RPM).',
    category: 'frontier'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Tercerdas',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    description: 'Model Flash tercerdas untuk alur kerja kompleks & diksi sastra (20 request/hari, 5 RPM).',
    category: 'frontier'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: 'Andal & Presisi',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    description: 'Model generasi 3.7 untuk akurasi tinggi dan konsistensi (20 request/hari, 5 RPM).',
    category: 'frontier'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Seimbang',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    description: 'Menyeimbangkan kecepatan kilat dan pemahaman teks (20 request/hari, 5 RPM).',
    category: 'frontier'
  }
];

export const GET: RequestHandler = async ({ url }) => {
  const apiKey = url.searchParams.get('apiKey') || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_api_key_here') {
    return json({ models: CURATED_MODELS });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelsPager = await ai.models.list();
    const liveModelNames = new Set<string>();

    for await (const m of modelsPager) {
      const modelId = (m.name || '').replace(/^models\//, '');
      liveModelNames.add(modelId);
    }

    console.log(`[API /api/models] Live models detected for API key: ${liveModelNames.size}`);

    // If live querying works, attach availability flag to curated models
    const enrichedModels = CURATED_MODELS.map((m) => ({
      ...m,
      isVerifiedAvailable: liveModelNames.has(m.id) || liveModelNames.has(`${m.id}-latest`)
    }));

    return json({ models: enrichedModels });
  } catch (err: any) {
    console.warn('[API /api/models] Could not list models from Google:', err.message);
    return json({ models: CURATED_MODELS, warning: err.message });
  }
};

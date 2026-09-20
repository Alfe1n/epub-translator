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
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Tercerdas',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    description: 'Model Flash tercerdas untuk alur kerja kompleks, rekayasa software & diksi tingkat tinggi.',
    category: 'frontier'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: 'Andal & Cerdas',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    description: 'Model generasi 3.7 untuk eksekusi multi-langkah yang presisi dan konsisten.',
    category: 'frontier'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Seimbang',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    description: 'Menyeimbangkan kecepatan kilat dan kemampuan pemahaman teks mendalam untuk tugas harian.',
    category: 'frontier'
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'Cepat & Stabil',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
    description: 'Memberikan kecepatan tinggi dan performa handal untuk beban kerja terjemahan rutin.',
    category: 'frontier'
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    tag: 'Super Hemat Kuota',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    description: 'Model multimodal paling hemat kuota dan tercepat di kelasnya. Biaya token mendekati nol.',
    category: 'efficiency'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    tag: 'Sastra Pro',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    description: 'Model flagship klasik dengan kecerdasan sastra tinggi, pemahaman subteks dan dialog novel.',
    category: 'classic'
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    tag: 'Kilat 2.0',
    badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border-teal-300 dark:border-teal-800',
    description: 'Model generasi 2.0 dengan latensi respons sangat cepat.',
    category: 'classic'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    tag: 'Klasik Stabil',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    description: 'Pilihan stabil teruji dan sangat hemat kuota token.',
    category: 'classic'
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

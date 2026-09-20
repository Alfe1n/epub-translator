import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  const hasServerApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'your_api_key_here';
  const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  return json({
    hasServerApiKey,
    defaultModel
  });
};

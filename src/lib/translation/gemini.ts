import { GoogleGenAI } from '@google/genai';
import type { TranslationBatch, TranslationStyle } from '$lib/epub/types';
import { getSystemInstruction, buildBatchPrompt } from './prompts';

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
}

/**
 * Translates a single batch of items using Google Gemini API with retry and exponential backoff.
 */
export async function translateBatchWithGemini(
  batch: TranslationBatch,
  style: TranslationStyle = 'literary',
  config: GeminiConfig = {},
  signal?: AbortSignal
): Promise<TranslationBatch> {
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_api_key_here') {
    throw new Error(
      'Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file or provide it in Settings.'
    );
  }

  const model = config.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (batch.items.length === 0) {
    batch.status = 'completed';
    return batch;
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = getSystemInstruction(style);
  const prompt = buildBatchPrompt(
    batch.items.map((i) => ({ id: i.id, html: i.originalHtml })),
    style
  );

  const maxRetries = 3;
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxRetries) {
    if (signal?.aborted) {
      throw new Error('Translation cancelled by user');
    }

    try {
      batch.status = 'translating';

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '';
      if (!responseText) {
        throw new Error('Received empty response from Gemini API');
      }

      // Parse JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        // Strip markdown backticks if returned despite json mimeType
        const cleaned = responseText
          .replace(/```(?:json)?\s*/gi, '')
          .replace(/```\s*$/gi, '')
          .trim();
        parsed = JSON.parse(cleaned);
      }

      const resultsArray: Array<{ id: string; translatedHtml: string }> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
          ? parsed.items
          : Array.isArray(parsed?.translations)
            ? parsed.translations
            : [];

      if (resultsArray.length === 0 && batch.items.length > 0) {
        throw new Error('Invalid translation response format from Gemini');
      }

      // Map back to batch items
      const resultMap = new Map<string, string>();
      for (const res of resultsArray) {
        if (res && res.id && typeof res.translatedHtml === 'string') {
          resultMap.set(res.id, res.translatedHtml);
        }
      }

      for (const item of batch.items) {
        if (resultMap.has(item.id)) {
          item.translatedHtml = resultMap.get(item.id);
        } else {
          // If a particular item was omitted, fallback to original to avoid losing content
          item.translatedHtml = item.originalHtml;
        }
      }

      batch.status = 'completed';
      batch.error = undefined;
      return batch;
    } catch (err: any) {
      lastError = err;
      attempt++;
      batch.retryCount = attempt;

      if (signal?.aborted) {
        throw new Error('Translation cancelled by user');
      }

      if (attempt < maxRetries) {
        // Exponential backoff: 1.5s, 3s, 6s + jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
        console.warn(
          `[Batch ${batch.id}] Translation attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // If reached here, all retries failed
  batch.status = 'error';
  batch.error = lastError?.message || 'Translation failed after 3 retries';
  throw new Error(`Batch ${batch.id} failed: ${batch.error}`);
}

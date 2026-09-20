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

  let model = config.model || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  if (model === 'gemini-2.5-pro') {
    model = 'gemini-3.8-flash';
  }

  if (batch.items.length === 0) {
    batch.status = 'completed';
    return batch;
  }

  // Pre-flight check: If batch has no alphabetic text (e.g. pure numbers, code brackets, empty spaces), complete with 0 API calls!
  const hasTranslatableText = batch.items.some((item) => {
    const text = (item.originalText || '').trim();
    return /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(text);
  });

  if (!hasTranslatableText) {
    console.log(`[Batch ${batch.id}] No translatable text detected. Marking completed with 0 Gemini API calls (quota saved).`);
    for (const item of batch.items) {
      item.translatedHtml = item.originalHtml;
    }
    batch.status = 'completed';
    return batch;
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = getSystemInstruction(style);
  const prompt = buildBatchPrompt(
    batch.items.map((i) => ({ id: i.id, html: i.originalHtml })),
    style
  );

  const requestConfig: any = {
    systemInstruction,
    temperature: 0.3,
    responseMimeType: 'application/json'
  };

  const maxRetries = 4;
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
        config: requestConfig
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

      // Fatal errors that should never be retried (avoids burning quota/time)
      const isFatalAuthError = err.message && (
        err.message.includes('API_KEY_INVALID') ||
        err.message.includes('API key not valid') ||
        err.message.includes('PERMISSION_DENIED') ||
        err.message.includes('UNAUTHENTICATED')
      );
      if (isFatalAuthError) {
        console.error(`[Batch ${batch.id}] Fatal API key authentication error: ${err.message}. Aborting retries immediately.`);
        break;
      }

      // If thinkingConfig is rejected by older or unsupported model, remove it and retry
      if (requestConfig.thinkingConfig && err.message?.toLowerCase().includes('thinking')) {
        console.warn(`[Batch ${batch.id}] thinkingConfig not supported for ${model}, disabling thinkingConfig...`);
        delete requestConfig.thinkingConfig;
      }

      // If 503 (high demand) or 429 (rate limit exhausted) or 404 (not found), failover to high-capacity model
      const isOverloaded = err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('UNAVAILABLE'));
      const isRateLimited = err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('quota'));
      const isNotFound = err.message && (err.message.includes('NOT_FOUND') || err.message.includes('404') || err.message.includes('not found'));

      if (isOverloaded || isRateLimited || isNotFound) {
        // High capacity fallback order: 2.0-flash (15 RPM) -> 2.5-flash-lite -> 1.5-flash
        const failoverMap: Record<string, string> = {
          'gemini-3.8-flash': 'gemini-2.0-flash',
          'gemini-3.7-flash': 'gemini-2.0-flash',
          'gemini-3.6-flash': 'gemini-2.0-flash',
          'gemini-3.5-flash': 'gemini-2.0-flash',
          'gemini-1.5-pro': 'gemini-2.0-flash',
          'gemini-2.0-flash': 'gemini-2.5-flash-lite',
          'gemini-2.5-flash-lite': 'gemini-1.5-flash',
          'gemini-1.5-flash': 'gemini-2.0-flash'
        };

        const targetModel = failoverMap[model] || 'gemini-2.0-flash';
        console.warn(
          `[Batch ${batch.id}] Model ${model} encountered ${isOverloaded ? '503 High Demand' : isRateLimited ? '429 Rate Limit' : '404 Not Found'}. Seamlessly switching to high-availability model: ${targetModel}...`
        );
        model = targetModel;
      }

      if (attempt < maxRetries) {
        // Parse Google's recommended retry delay if present
        let delay = Math.pow(1.8, attempt) * 1200 + Math.floor(Math.random() * 400);
        const retryMatch = err.message?.match(/retry in ([\d.]+)s/i);
        if (retryMatch && retryMatch[1]) {
          const parsedSec = Math.ceil(parseFloat(retryMatch[1]));
          if (parsedSec > 0 && parsedSec <= 10) {
            delay = parsedSec * 1000 + 500;
          }
        }

        console.warn(
          `[Batch ${batch.id}] Translation attempt ${attempt} failed: ${err.message}. Retrying with model ${model} in ${Math.round(delay)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Clean error message for user UI
  let cleanError = lastError?.message || 'Translation failed after retries';
  try {
    const parsedErr = JSON.parse(cleanError);
    if (parsedErr?.error?.message) {
      cleanError = parsedErr.error.message;
    }
  } catch {}

  if (cleanError.includes('503') || cleanError.includes('high demand') || cleanError.includes('UNAVAILABLE')) {
    cleanError = 'Server Google sedang mengalami lonjakan beban (503 High Demand). Silakan klik tombol Retry.';
  } else if (cleanError.includes('429') || cleanError.includes('quota') || cleanError.includes('RESOURCE_EXHAUSTED')) {
    cleanError = 'Batas kuota request per menit terlampaui (429 Rate Limit). Silakan tunggu sebentar lalu klik Retry.';
  }

  batch.status = 'error';
  batch.error = cleanError;
  throw new Error(`Batch ${batch.id} failed: ${cleanError}`);
}

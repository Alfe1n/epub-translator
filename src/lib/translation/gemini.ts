import { GoogleGenAI } from '@google/genai';
import type { TranslationBatch, TranslationStyle } from '$lib/epub/types';
import { getSystemInstruction, buildBatchPrompt } from './prompts';

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
}

/**
 * Fault-tolerant JSON parser & repair engine for LLM outputs.
 * Handles markdown fences, raw unescaped newlines/tabs inside strings,
 * invalid escape sequences (e.g. \&, \', \ ), trailing commas,
 * text before/after JSON arrays, and regex extraction fallback.
 */
function repairAndParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Strip markdown code fences if present
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Fast path: direct JSON.parse
  try {
    return JSON.parse(text);
  } catch {}

  // 2. Extract JSON slice between first [ or { and last ] or }
  const firstArr = text.indexOf('[');
  const lastArr = text.lastIndexOf(']');
  const firstObj = text.indexOf('{');
  const lastObj = text.lastIndexOf('}');

  let candidate = text;
  if (firstArr !== -1 && lastArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    candidate = text.slice(firstArr, lastArr + 1);
  } else if (firstObj !== -1 && lastObj !== -1) {
    candidate = text.slice(firstObj, lastObj + 1);
  }

  try {
    return JSON.parse(candidate);
  } catch {}

  // 3. Fix unescaped control characters and invalid backslashes inside string literals
  let insideString = false;
  let escaped = false;
  let repaired = '';

  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];
    const code = candidate.charCodeAt(i);

    if (insideString) {
      if (escaped) {
        escaped = false;
        if (/["\\\/bfnrtu]/.test(char)) {
          repaired += char;
        } else {
          // Escape invalid backslash: e.g. \& -> \\&
          repaired = repaired.slice(0, -1) + '\\\\' + char;
        }
      } else if (char === '\\') {
        escaped = true;
        repaired += char;
      } else if (char === '"') {
        insideString = false;
        repaired += char;
      } else if (code < 0x20) {
        // Control char inside string literal: escape it!
        if (char === '\n') repaired += '\\n';
        else if (char === '\r') repaired += '\\r';
        else if (char === '\t') repaired += '\\t';
      } else {
        repaired += char;
      }
    } else {
      if (char === '"') {
        insideString = true;
      }
      repaired += char;
    }
  }

  // Remove trailing commas before ] or }
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(repaired);
  } catch {}

  // 4. Regex fallback: Extract any { id: ..., html: ... } pairs even from corrupted JSON
  const extractedItems: Array<{ id: string; translatedHtml: string }> = [];
  const itemRegex = /"id"\s*:\s*"([^"]+)"[\s\S]*?"(?:translatedHtml|html|translation|text|content)"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
  let match;
  while ((match = itemRegex.exec(candidate)) !== null) {
    try {
      const id = match[1];
      const val = JSON.parse(`"${match[2]}"`);
      extractedItems.push({ id, translatedHtml: val });
    } catch {
      extractedItems.push({ id: match[1], translatedHtml: match[2] });
    }
  }

  if (extractedItems.length > 0) {
    return extractedItems;
  }

  return null;
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

  let model = config.model || process.env.GEMINI_MODEL || 'dual-flash-lite';

  // Support Dual-Engine auto load-balancing / rotation (1,000 RPD combined)
  if (model === 'dual-flash-lite' || model === 'auto-lite') {
    model = (batch.batchIndex + (batch.chapterIndex % 2)) % 2 === 0
      ? 'gemini-3.5-flash-lite'
      : 'gemini-3.1-flash-lite';
  }

  // Map retired or 404 models directly to active 500 RPD gemini-3.5-flash-lite
  if (
    model === 'gemini-2.5-flash-lite' ||
    model === 'gemini-1.5-flash' ||
    model === 'gemini-1.5-pro' ||
    model === 'gemini-2.5-pro' ||
    model === 'gemini-2.0-flash'
  ) {
    model = 'gemini-3.5-flash-lite';
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
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          translatedHtml: { type: 'STRING' }
        },
        required: ['id', 'translatedHtml']
      }
    }
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

      // Parse and repair JSON response
      const parsed = repairAndParseJson(responseText);
      const resultMap = new Map<string, string>();

      if (Array.isArray(parsed)) {
        for (const res of parsed) {
          if (res && typeof res === 'object') {
            const id = res.id || res.key || res.item_id;
            const html = res.translatedHtml ?? res.html ?? res.translation ?? res.translated_text ?? res.text ?? res.content;
            if (id && typeof html === 'string') {
              resultMap.set(String(id), html);
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const list = Array.isArray(parsed.items)
          ? parsed.items
          : Array.isArray(parsed.translations)
            ? parsed.translations
            : Array.isArray(parsed.results)
              ? parsed.results
              : null;

        if (list) {
          for (const res of list) {
            if (res && typeof res === 'object') {
              const id = res.id || res.key || res.item_id;
              const html = res.translatedHtml ?? res.html ?? res.translation ?? res.translated_text ?? res.text ?? res.content;
              if (id && typeof html === 'string') {
                resultMap.set(String(id), html);
              }
            }
          }
        } else {
          // Direct key-value map: { "item_1": "<p>Halo</p>" }
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === 'string') {
              resultMap.set(key, val);
            } else if (val && typeof val === 'object' && typeof (val as any).translatedHtml === 'string') {
              resultMap.set(key, (val as any).translatedHtml);
            }
          }
        }
      }

      if (resultMap.size === 0 && batch.items.length > 0) {
        throw new Error('Invalid translation response format from Gemini');
      }

      // Map back to batch items with fuzzy match and safe fallback
      for (const item of batch.items) {
        if (resultMap.has(item.id)) {
          item.translatedHtml = resultMap.get(item.id);
        } else {
          const fuzzyKey = Array.from(resultMap.keys()).find(k => k.includes(item.id) || item.id.includes(k));
          if (fuzzyKey) {
            item.translatedHtml = resultMap.get(fuzzyKey);
          } else {
            // Fallback to original to avoid losing content
            item.translatedHtml = item.originalHtml;
          }
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

      // If responseSchema is rejected by model, remove it and retry
      if (requestConfig.responseSchema && err.message?.toLowerCase().includes('schema')) {
        console.warn(`[Batch ${batch.id}] responseSchema not supported for ${model}, disabling responseSchema...`);
        delete requestConfig.responseSchema;
      }

      // If 503 (high demand) or 429 (rate limit exhausted) or 404 (not found), failover to high-capacity model
      const isOverloaded = err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('UNAVAILABLE'));
      const isRateLimited = err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('quota'));
      const isNotFound = err.message && (err.message.includes('NOT_FOUND') || err.message.includes('404') || err.message.includes('not found'));

      if (isOverloaded || isRateLimited || isNotFound) {
        // High capacity fallback order: gemini-3.5-flash-lite (500 RPD, 15 RPM) -> gemini-3.1-flash-lite (500 RPD) -> gemini-3.5-flash
        const failoverMap: Record<string, string> = {
          'gemini-3.8-flash': 'gemini-3.5-flash-lite',
          'gemini-3.7-flash': 'gemini-3.5-flash-lite',
          'gemini-3.6-flash': 'gemini-3.5-flash-lite',
          'gemini-3.5-flash': 'gemini-3.5-flash-lite',
          'gemini-2.5-flash': 'gemini-3.5-flash-lite',
          'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
          'gemini-1.5-pro': 'gemini-3.5-flash-lite',
          'gemini-1.5-flash': 'gemini-3.5-flash-lite',
          'gemini-2.0-flash': 'gemini-3.5-flash-lite',
          'gemini-3.5-flash-lite': 'gemini-3.1-flash-lite',
          'gemini-3.1-flash-lite': 'gemini-3.5-flash'
        };

        const targetModel = failoverMap[model] || 'gemini-3.5-flash-lite';
        console.warn(
          `[Batch ${batch.id}] Model ${model} encountered ${isOverloaded ? '503 High Demand' : isRateLimited ? '429 Rate Limit' : '404 Not Found'}. Seamlessly switching to verified high-quota model: ${targetModel}...`
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

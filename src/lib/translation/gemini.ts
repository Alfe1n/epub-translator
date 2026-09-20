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

  // For Gemini 3.5+ models, minimize thinking depth to save quota and generate immediate translations
  if (model.includes('3.8') || model.includes('3.7') || model.includes('3.6') || model.includes('3.5')) {
    requestConfig.thinkingConfig = { thinkingLevel: 'MINIMAL' };
  } else if (model.includes('2.5')) {
    requestConfig.thinkingConfig = { thinkingBudget: 0 };
  }

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

      // If thinkingConfig is rejected by older or unsupported model, remove it and retry
      if (requestConfig.thinkingConfig && err.message?.toLowerCase().includes('thinking')) {
        console.warn(`[Batch ${batch.id}] thinkingConfig not supported for ${model}, disabling thinkingConfig...`);
        delete requestConfig.thinkingConfig;
      }

      // If the model was 404 / unavailable, query available models for this specific API key
      if (
        err.message &&
        (err.message.includes('NOT_FOUND') ||
          err.message.includes('404') ||
          err.message.includes('not found') ||
          err.message.includes('no longer available'))
      ) {
        try {
          console.warn(
            `[Batch ${batch.id}] Model ${model} is not available (404). Querying available models from Google...`
          );
          const listPager = await ai.models.list();
          const validModels: string[] = [];
          for await (const m of listPager) {
            const mName = m.name || '';
            if (
              mName.includes('gemini') &&
              !mName.includes('embedding') &&
              !mName.includes('imagen') &&
              !mName.includes('aqa')
            ) {
              validModels.push(mName.replace(/^models\//, ''));
            }
          }

          console.log(`[Batch ${batch.id}] Available models on this API key:`, validModels);

          if (validModels.length > 0) {
            // Check preference hierarchy
            const candidateOrder = [
              'gemini-3.8-flash',
              'gemini-3.7-flash',
              'gemini-3.6-flash',
              'gemini-3.5-flash',
              'gemini-2.5-flash-lite',
              'gemini-2.0-flash',
              'gemini-1.5-pro',
              'gemini-1.5-flash'
            ];

            let candidate = candidateOrder.find((c) => c !== model && validModels.includes(c));
            if (!candidate) {
              candidate = validModels.find((m) => m !== model) || validModels[0];
            }

            console.warn(
              `[Batch ${batch.id}] Automatically switching model from ${model} to verified available model: ${candidate}`
            );
            model = candidate;
          }
        } catch (listErr: any) {
          console.error('[Gemini API] Failed to query available models:', listErr.message);
          model = model === 'gemini-2.0-flash' ? 'gemini-1.5-flash-latest' : 'gemini-2.0-flash';
        }
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

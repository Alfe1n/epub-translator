import { json, type RequestHandler } from '@sveltejs/kit';
import { getSession, startTranslationSession } from '$lib/translation/queue';
import type { TranslationStyle } from '$lib/epub/types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { sessionId, style, apiKey, model } = body as {
      sessionId: string;
      style?: TranslationStyle;
      apiKey?: string;
      model?: string;
    };

    if (!sessionId) {
      return json({ error: 'Session ID is required.' }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return json({ error: 'Session expired or not found. Please upload the file again.' }, { status: 404 });
    }

    // Launch translation asynchronously so HTTP response returns immediately
    startTranslationSession(sessionId, style || 'literary', { apiKey, model }).catch((err) => {
      console.error(`Background translation error for session ${sessionId}:`, err);
    });

    return json({
      success: true,
      message: 'Translation started successfully.'
    });
  } catch (err: any) {
    console.error('Error starting translation:', err);
    return json({ error: err.message || 'Failed to start translation.' }, { status: 500 });
  }
};

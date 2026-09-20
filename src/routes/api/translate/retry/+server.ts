import { json, type RequestHandler } from '@sveltejs/kit';
import { retryBatch, getSession } from '$lib/translation/queue';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { sessionId, chapterIndex, batchIndex, apiKey, model } = await request.json();

    if (!sessionId || chapterIndex === undefined || batchIndex === undefined) {
      return json(
        { error: 'sessionId, chapterIndex, and batchIndex are required.' },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return json({ error: 'Session not found or expired.' }, { status: 404 });
    }

    await retryBatch(sessionId, chapterIndex, batchIndex, { apiKey, model });

    return json({ success: true, message: 'Batch retried successfully.' });
  } catch (err: any) {
    console.error('Error retrying batch:', err);
    return json({ error: err.message || 'Failed to retry batch.' }, { status: 500 });
  }
};

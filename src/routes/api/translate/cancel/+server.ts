import { json, type RequestHandler } from '@sveltejs/kit';
import { cancelTranslation, getSession } from '$lib/translation/queue';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return json({ error: 'sessionId is required.' }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return json({ error: 'Session not found.' }, { status: 404 });
    }

    cancelTranslation(sessionId);
    return json({ success: true, message: 'Translation cancelled.' });
  } catch (err: any) {
    return json({ error: err.message || 'Failed to cancel translation.' }, { status: 500 });
  }
};

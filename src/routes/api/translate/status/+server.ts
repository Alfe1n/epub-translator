import { json, type RequestHandler } from '@sveltejs/kit';
import { getSession, subscribeToProgress, createProgressEvent } from '$lib/translation/queue';
import type { TranslationProgressEvent } from '$lib/epub/types';

export const GET: RequestHandler = async ({ url, request }) => {
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return json({ error: 'sessionId parameter is required.' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return json({ error: 'Session not found or expired.' }, { status: 404 });
  }

  const acceptHeader = request.headers.get('accept') || '';
  const isSse = acceptHeader.includes('text/event-stream');

  if (isSse) {
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const send = (event: TranslationProgressEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            if (event.status === 'completed' || event.status === 'cancelled') {
              // We can keep it open or let client close
            }
          } catch {
            // Stream might be closed
          }
        };

        unsubscribe = subscribeToProgress(sessionId, send);

        request.signal.addEventListener('abort', () => {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          try {
            controller.close();
          } catch {}
        });
      },
      cancel() {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  // Non-SSE fallback: return current progress snapshot
  return json(createProgressEvent(session, 'Polling update'));
};

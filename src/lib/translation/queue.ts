import type {
  TranslationSession,
  TranslationProgressEvent,
  TranslationBatch,
  TranslationStyle
} from '$lib/epub/types';
import { translateBatchWithGemini, type GeminiConfig } from './gemini';
import { reassembleXhtml } from './chunker';

// In-memory session store
const sessions = new Map<string, TranslationSession>();

// Event listeners for SSE progress per session
type ProgressListener = (event: TranslationProgressEvent) => void;
const listeners = new Map<string, Set<ProgressListener>>();

// Concurrency limit
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_TRANSLATIONS || '2', 10) || 2;

// Clean up sessions older than 2 hours every 15 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > maxAge) {
      if (session.abortController) {
        session.abortController.abort();
      }
      sessions.delete(id);
      listeners.delete(id);
    }
  }
}, 15 * 60 * 1000);

export function getSession(id: string): TranslationSession | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = Date.now();
  }
  return session;
}

export function saveSession(session: TranslationSession): void {
  session.lastActivity = Date.now();
  sessions.set(session.id, session);
}

export function subscribeToProgress(sessionId: string, listener: ProgressListener): () => void {
  if (!listeners.has(sessionId)) {
    listeners.set(sessionId, new Set());
  }
  listeners.get(sessionId)!.add(listener);

  // Send initial progress immediately
  const session = sessions.get(sessionId);
  if (session) {
    listener(createProgressEvent(session, 'Initial state'));
  }

  return () => {
    const set = listeners.get(sessionId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(sessionId);
      }
    }
  };
}

export function broadcastProgress(session: TranslationSession, message: string): void {
  const event = createProgressEvent(session, message);
  const set = listeners.get(session.id);
  if (set) {
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in progress listener:', err);
      }
    }
  }
}

export function createProgressEvent(
  session: TranslationSession,
  message: string
): TranslationProgressEvent {
  let completedChapters = 0;
  let currentChapterIndex = 0;
  let currentBatchIndex = 0;
  let totalBatchesInChapter = 0;
  const failedBatches: Array<{ chapterIndex: number; batchIndex: number; error: string }> = [];

  for (let i = 0; i < session.chapters.length; i++) {
    const ch = session.chapters[i];
    if (ch.status === 'completed') {
      completedChapters++;
    } else if (ch.status === 'translating') {
      currentChapterIndex = i;
    }

    for (let b = 0; b < ch.batches.length; b++) {
      const batch = ch.batches[b];
      if (batch.status === 'translating') {
        currentChapterIndex = i;
        currentBatchIndex = b;
      } else if (batch.status === 'error') {
        failedBatches.push({
          chapterIndex: i,
          batchIndex: b,
          error: batch.error || 'Unknown error'
        });
      }
    }
  }

  const curCh = session.chapters[currentChapterIndex] || session.chapters[0];
  totalBatchesInChapter = curCh ? curCh.batches.length : 0;
  const percent =
    session.totalBatches > 0
      ? Math.min(100, Math.round((session.completedBatches / session.totalBatches) * 100))
      : 100;

  return {
    sessionId: session.id,
    status: session.status,
    currentChapterIndex,
    currentChapterTitle: curCh ? curCh.title : 'Overview',
    totalChapters: session.chapters.length,
    completedChapters,
    currentBatchIndex,
    totalBatchesInChapter,
    completedBatchesTotal: session.completedBatches,
    totalBatches: session.totalBatches,
    percent,
    message,
    failedBatches
  };
}

/**
 * Executes translation of the entire session through a controlled concurrency queue.
 */
export async function startTranslationSession(
  sessionId: string,
  style: TranslationStyle = 'literary',
  config: GeminiConfig = {}
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found.`);
  }

  if (session.status === 'translating') {
    return; // Already running
  }

  session.status = 'translating';
  session.style = style;
  session.abortController = new AbortController();
  const signal = session.abortController.signal;

  broadcastProgress(session, 'Starting translation queue...');

  // Flatten pending batches
  const pendingBatches: TranslationBatch[] = [];
  for (const chapter of session.chapters) {
    for (const batch of chapter.batches) {
      if (batch.status !== 'completed') {
        pendingBatches.push(batch);
      }
    }
  }

  if (pendingBatches.length === 0) {
    session.status = 'completed';
    broadcastProgress(session, 'Translation completed! All chapters are ready.');
    return;
  }

  // Queue runner with concurrency limit & Quota Circuit Breaker
  let runningCount = 0;
  let nextBatchIdx = 0;
  let hasErrors = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  let circuitBroken = false;

  async function processNext(): Promise<void> {
    if (signal.aborted || circuitBroken) return;
    if (nextBatchIdx >= pendingBatches.length) return;

    const batch = pendingBatches[nextBatchIdx++];
    const chapter = session!.chapters[batch.chapterIndex];
    chapter.status = 'translating';

    runningCount++;
    broadcastProgress(
      session!,
      `Translating ${chapter.title} (Batch ${batch.batchIndex + 1}/${chapter.batches.length})...`
    );

    try {
      await translateBatchWithGemini(batch, session!.style, config, signal);
      consecutiveErrors = 0; // Reset consecutive failures on success
      session!.completedBatches++;

      // Check if all batches in this chapter are completed
      const allChapterDone = chapter.batches.every((b) => b.status === 'completed');
      if (allChapterDone) {
        chapter.status = 'completed';
        chapter.translatedContent = reassembleXhtml(chapter.rawContent, chapter.batches);
        broadcastProgress(session!, `Completed ${chapter.title}!`);
      }
    } catch (err: any) {
      if (signal.aborted) {
        return;
      }
      hasErrors = true;
      consecutiveErrors++;
      chapter.status = 'error';
      console.error(`[Session ${session!.id}] Error translating batch ${batch.id}:`, err.message || err);

      // Trigger Circuit Breaker to protect user's Gemini quota
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        circuitBroken = true;
        session!.status = 'error';
        console.warn(
          `[Session ${session!.id}] 🛑 Circuit Breaker Triggered: ${consecutiveErrors} consecutive batches failed. Auto-pausing queue to prevent burning Gemini quota.`
        );
        broadcastProgress(
          session!,
          '🛑 Rem Pengaman Kuota Aktif: Sistem otomatis menjeda antrean untuk melindungi kuota Gemini Anda. Silakan periksa koneksi atau klik Retry.'
        );
        return;
      }

      broadcastProgress(
        session!,
        `Failed batch ${batch.batchIndex + 1} of ${chapter.title}: ${err.message}`
      );
    } finally {
      runningCount--;
      if (!signal.aborted && !circuitBroken && nextBatchIdx < pendingBatches.length) {
        // Small pacing delay to prevent hitting Google AI Studio RPM bursts
        await new Promise((resolve) => setTimeout(resolve, 800));
        await processNext();
      }
    }
  }

  // Launch initial concurrent workers with slight stagger
  const workerPromises: Promise<void>[] = [];
  const initialWorkers = Math.min(MAX_CONCURRENT, pendingBatches.length);
  for (let i = 0; i < initialWorkers; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    workerPromises.push(processNext());
  }

  await Promise.all(workerPromises);

  if (signal.aborted) {
    session.status = 'cancelled';
    broadcastProgress(session, 'Translation cancelled by user.');
    return;
  }

  if (circuitBroken) {
    session.status = 'error';
    return;
  }

  // Final check
  const allBatchesCompleted = session.chapters.every((ch) =>
    ch.batches.every((b) => b.status === 'completed')
  );

  if (allBatchesCompleted) {
    session.status = 'completed';
    // Reassemble any chapter that hasn't been reassembled yet
    for (const ch of session.chapters) {
      if (!ch.translatedContent) {
        ch.translatedContent = reassembleXhtml(ch.rawContent, ch.batches);
      }
    }
    broadcastProgress(session, 'Translation complete! Your book is ready for reading & download.');
  } else if (hasErrors) {
    session.status = 'error';
    broadcastProgress(session, 'Translation paused due to batch errors. You can retry failed batches.');
  }
}

/**
 * Retries a specific failed batch
 */
export async function retryBatch(
  sessionId: string,
  chapterIndex: number,
  batchIndex: number,
  config: GeminiConfig = {}
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const chapter = session.chapters[chapterIndex];
  if (!chapter) throw new Error('Chapter not found');

  const batch = chapter.batches[batchIndex];
  if (!batch) throw new Error('Batch not found');

  broadcastProgress(session, `Retrying ${chapter.title} (Batch ${batchIndex + 1})...`);

  try {
    batch.status = 'pending';
    batch.retryCount = 0;
    batch.error = undefined;

    await translateBatchWithGemini(batch, session.style, config);
    session.completedBatches++;

    // Check if chapter is now complete
    if (chapter.batches.every((b) => b.status === 'completed')) {
      chapter.status = 'completed';
      chapter.translatedContent = reassembleXhtml(chapter.rawContent, chapter.batches);
    }

    // Check if whole book is now complete
    if (session.chapters.every((ch) => ch.batches.every((b) => b.status === 'completed'))) {
      session.status = 'completed';
    } else {
      session.status = 'translating';
    }

    broadcastProgress(session, `Batch ${batchIndex + 1} of ${chapter.title} translated successfully!`);
  } catch (err: any) {
    chapter.status = 'error';
    broadcastProgress(session, `Retry failed for ${chapter.title} (Batch ${batchIndex + 1}): ${err.message}`);
    throw err;
  }
}

/**
 * Cancels active translation
 */
export function cancelTranslation(sessionId: string): void {
  const session = getSession(sessionId);
  if (session && session.abortController) {
    session.abortController.abort();
    session.status = 'cancelled';
    broadcastProgress(session, 'Translation cancelled by user.');
  }
}

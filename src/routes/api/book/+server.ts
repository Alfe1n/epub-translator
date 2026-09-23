import { json, type RequestHandler } from '@sveltejs/kit';
import { getSession } from '$lib/translation/queue';

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return json({ error: 'sessionId parameter is required.' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return json({ error: 'Sesi buku tidak ditemukan atau telah kedaluwarsa.' }, { status: 404 });
  }

  return json({
    sessionId: session.id,
    filename: session.originalFilename,
    fileSizeBytes: session.fileSizeBytes,
    title: session.metadata.title || 'Untitled Book',
    author: session.metadata.creator || 'Unknown Author',
    language: session.metadata.language || 'en',
    coverBase64: session.metadata.coverBase64 || null,
    totalWords: session.totalWords,
    totalBatches: session.totalBatches,
    totalChapters: session.chapters.length,
    completedBatches: session.completedBatches,
    status: session.status,
    chapters: session.chapters.map((ch) => ({
      index: ch.index,
      title: ch.title,
      wordCount: ch.wordCount,
      batchesCount: ch.batches.length,
      status: ch.status,
      isTranslated: !!ch.translatedContent || (ch.batches.length > 0 && ch.batches.every((b) => b.status === 'completed'))
    }))
  });
};

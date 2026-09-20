import { json, type RequestHandler } from '@sveltejs/kit';
import crypto from 'crypto';
import { parseEpub } from '$lib/epub/parser';
import { saveSession } from '$lib/translation/queue';
import type { TranslationSession } from '$lib/epub/types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return json({ error: 'No file uploaded. Please upload a valid .epub file.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return json(
        { error: 'File size exceeds 50 MB limit. Please choose a smaller EPUB.' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.epub')) {
      return json(
        { error: 'Invalid file extension. Only .epub files are supported.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify ZIP magic bytes (PK\x03\x04)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return json(
        { error: 'Invalid file format. The file is not a valid ZIP/EPUB container.' },
        { status: 400 }
      );
    }

    // Parse EPUB
    const { parsed } = await parseEpub(buffer);

    const sessionId = crypto.randomUUID();
    const session: TranslationSession = {
      id: sessionId,
      originalFilename: file.name,
      fileSizeBytes: file.size,
      originalZipBuffer: buffer,
      opfPath: parsed.opfPath,
      metadata: parsed.metadata,
      chapters: parsed.chapters,
      totalWords: parsed.totalWords,
      totalBatches: parsed.totalBatches,
      completedBatches: 0,
      status: 'uploaded',
      style: 'literary',
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    saveSession(session);

    return json({
      sessionId,
      filename: file.name,
      fileSizeBytes: file.size,
      metadata: parsed.metadata,
      totalWords: parsed.totalWords,
      totalBatches: parsed.totalBatches,
      totalChapters: parsed.chapters.length,
      chapters: parsed.chapters.map((ch) => ({
        index: ch.index,
        title: ch.title,
        wordCount: ch.wordCount,
        batchesCount: ch.batches.length
      }))
    });
  } catch (err: any) {
    console.error('Error during EPUB upload & parse:', err);
    return json(
      { error: err.message || 'Failed to parse EPUB file. Please ensure it is a valid ebook.' },
      { status: 500 }
    );
  }
};

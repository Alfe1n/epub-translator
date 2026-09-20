export type TranslationStyle = 'literary' | 'nonfiction' | 'academic' | 'technical';

export interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  description?: string;
  publisher?: string;
  coverHref?: string;
  coverBase64?: string;
  coverMediaType?: string;
}

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

export interface EpubSpineItem {
  idref: string;
  linear?: string;
}

export interface TranslationItem {
  id: string;
  originalHtml: string;
  originalText: string;
  translatedHtml?: string;
}

export interface TranslationBatch {
  id: string;
  chapterIndex: number;
  batchIndex: number;
  items: TranslationItem[];
  wordCount: number;
  status: 'pending' | 'translating' | 'completed' | 'error';
  error?: string;
  retryCount: number;
}

export interface EpubChapter {
  index: number;
  id: string;
  href: string;
  fullPath: string;
  title: string;
  wordCount: number;
  batches: TranslationBatch[];
  rawContent: string;
  translatedContent?: string;
  status: 'pending' | 'translating' | 'completed' | 'error';
  error?: string;
}

export interface TranslationSession {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  originalZipBuffer: Buffer;
  opfPath: string;
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  totalWords: number;
  totalBatches: number;
  completedBatches: number;
  status: 'uploaded' | 'translating' | 'completed' | 'cancelled' | 'error';
  style: TranslationStyle;
  createdAt: number;
  lastActivity: number;
  activeError?: string;
  abortController?: AbortController;
}

export interface TranslationProgressEvent {
  sessionId: string;
  status: 'uploaded' | 'translating' | 'completed' | 'cancelled' | 'error';
  currentChapterIndex: number;
  currentChapterTitle: string;
  totalChapters: number;
  completedChapters: number;
  currentBatchIndex: number;
  totalBatchesInChapter: number;
  completedBatchesTotal: number;
  totalBatches: number;
  percent: number;
  message: string;
  failedBatches: Array<{
    chapterIndex: number;
    batchIndex: number;
    error: string;
  }>;
}

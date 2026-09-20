import JSZip from 'jszip';
import * as cheerio from 'cheerio';
import type { TranslationSession } from './types';
import { reassembleXhtml } from '$lib/translation/chunker';

/**
 * Builds a clean, fully compliant EPUB archive from the translated session.
 */
export async function buildTranslatedEpub(session: TranslationSession): Promise<Buffer> {
  const originalZip = await JSZip.loadAsync(session.originalZipBuffer);
  const newZip = new JSZip();

  // 1. SPEC COMPLIANCE: Mimetype MUST be the first file and UNCOMPRESSED (STORE)
  newZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // Map of chapter fullPath -> translated XHTML string
  const chapterContentMap = new Map<string, string>();
  for (const chapter of session.chapters) {
    if (chapter.translatedContent) {
      chapterContentMap.set(chapter.fullPath, chapter.translatedContent);
    } else if (chapter.batches && chapter.batches.length > 0) {
      const translatedXhtml = reassembleXhtml(chapter.rawContent, chapter.batches);
      chapterContentMap.set(chapter.fullPath, translatedXhtml);
    }
  }

  // 2. Iterate through all files in original zip
  const files = Object.keys(originalZip.files);

  for (const filename of files) {
    // Skip mimetype since it was already added first
    if (filename === 'mimetype') continue;

    const file = originalZip.files[filename];
    if (file.dir) {
      // Directories are created automatically by JSZip when adding files
      continue;
    }

    // A. If this file is a translated chapter XHTML
    if (chapterContentMap.has(filename)) {
      const content = chapterContentMap.get(filename)!;
      newZip.file(filename, content, { compression: 'DEFLATE' });
    }
    // B. If this file is the OPF package document, update metadata
    else if (filename === session.opfPath) {
      const originalOpf = await file.async('string');
      const $opf = cheerio.load(originalOpf, { xml: true });

      // Update language to 'id'
      const langEl = $opf('metadata').find('dc\\:language, language').first();
      if (langEl.length > 0) {
        langEl.text('id');
      } else {
        $opf('metadata').append('<dc:language>id</dc:language>');
      }

      // Append Indonesian indicator to title if not already present
      const titleEl = $opf('metadata').find('dc\\:title, title').first();
      if (titleEl.length > 0) {
        const curTitle = titleEl.text().trim();
        if (!curTitle.includes('[ID]') && !curTitle.includes('(Bahasa Indonesia)')) {
          titleEl.text(`${curTitle} (Bahasa Indonesia)`);
        }
      }

      newZip.file(filename, $opf.xml(), { compression: 'DEFLATE' });
    }
    // C. All other files (images, css, fonts, container.xml, ncx, etc.)
    else {
      const buffer = await file.async('nodebuffer');
      newZip.file(filename, buffer, { compression: 'DEFLATE' });
    }
  }

  // Generate output buffer
  const epubBuffer = await newZip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  return epubBuffer;
}

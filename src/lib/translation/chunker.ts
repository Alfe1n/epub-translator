import * as cheerio from 'cheerio';
import type { TranslationItem, TranslationBatch } from '$lib/epub/types';

// Block tags that can represent translatable units
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, caption';
const CHILD_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, caption, div, ul, ol, table';

const MAX_BATCH_WORDS = 3500;
const MAX_BATCH_ITEMS = 35;

export interface ExtractedChapterContent {
  title: string;
  wordCount: number;
  batches: TranslationBatch[];
  annotatedXhtml: string;
}

/**
 * Parses an XHTML string and extracts translatable content blocks
 * tagged with temporary `data-lb-id` attributes.
 */
export function extractTranslatableBlocks(
  xhtml: string,
  chapterIndex: number
): ExtractedChapterContent {
  if (!xhtml || typeof xhtml !== 'string' || xhtml.trim().length === 0) {
    return {
      title: `Chapter ${chapterIndex + 1}`,
      wordCount: 0,
      batches: [],
      annotatedXhtml: xhtml || ''
    };
  }

  try {
    const $ = cheerio.load(xhtml, { xml: true });

    // Detect title
    let title = '';
    const titleTag = $('title').first().text().trim();
    const h1Tag = $('h1').first().text().trim();
    const h2Tag = $('h2').first().text().trim();

    if (h1Tag) {
      title = h1Tag;
    } else if (h2Tag) {
      title = h2Tag;
    } else if (titleTag) {
      title = titleTag;
    } else {
      title = `Chapter ${chapterIndex + 1}`;
    }

  const items: TranslationItem[] = [];
  let itemCounter = 0;

  // Optionally include <title> in translation if present and not empty
  const headTitle = $('head > title');
  if (headTitle.length > 0 && headTitle.text().trim().length > 0) {
    const id = `item_${chapterIndex}_${itemCounter++}`;
    headTitle.attr('data-lb-id', id);
    items.push({
      id,
      originalHtml: headTitle.html() || headTitle.text(),
      originalText: headTitle.text().trim()
    });
  }

  // Find candidate block elements
  $(BLOCK_SELECTOR).each((_, element) => {
    const el = $(element);
    
    // Check if element has child block elements. If so, skip and let children be translated.
    if (el.find(CHILD_BLOCKS).length > 0) {
      return;
    }

    const text = el.text().trim();
    if (!text || text.length === 0) {
      return;
    }

    // Skip pure numbers or single special characters like separator dots/stars
    if (/^[*•\-_~#\s\d]+$/.test(text) && text.length <= 4) {
      return;
    }

    const id = `item_${chapterIndex}_${itemCounter++}`;
    el.attr('data-lb-id', id);

    const innerHtml = el.html() || text;
    items.push({
      id,
      originalHtml: innerHtml,
      originalText: text
    });
  });

  // Also check direct text containers like <div class="..."> that don't have block children
  $('div').each((_, element) => {
    const el = $(element);
    // If it already has data-lb-id or contains child blocks, skip
    if (el.attr('data-lb-id') || el.find(CHILD_BLOCKS).length > 0) {
      return;
    }

    const text = el.text().trim();
    if (!text || text.length === 0) {
      return;
    }

    if (/^[*•\-_~#\s\d]+$/.test(text) && text.length <= 4) {
      return;
    }

    const id = `item_${chapterIndex}_${itemCounter++}`;
    el.attr('data-lb-id', id);
    items.push({
      id,
      originalHtml: el.html() || text,
      originalText: text
    });
  });

  // Calculate word count
  let totalWordCount = 0;
  for (const item of items) {
    const words = item.originalText.split(/\s+/).filter(Boolean).length;
    totalWordCount += words;
  }

  // Create batches
  const batches: TranslationBatch[] = [];
  let currentBatchItems: TranslationItem[] = [];
  let currentBatchWords = 0;
  let batchIndex = 0;

  for (const item of items) {
    const words = item.originalText.split(/\s+/).filter(Boolean).length;
    
    // If adding this item exceeds limits, push current batch
    if (
      currentBatchItems.length > 0 &&
      (currentBatchItems.length >= MAX_BATCH_ITEMS || currentBatchWords + words > MAX_BATCH_WORDS)
    ) {
      batches.push({
        id: `ch${chapterIndex}_b${batchIndex}`,
        chapterIndex,
        batchIndex,
        items: currentBatchItems,
        wordCount: currentBatchWords,
        status: 'pending',
        retryCount: 0
      });
      batchIndex++;
      currentBatchItems = [];
      currentBatchWords = 0;
    }

    currentBatchItems.push(item);
    currentBatchWords += words;
  }

  // Final batch
  if (currentBatchItems.length > 0) {
    batches.push({
      id: `ch${chapterIndex}_b${batchIndex}`,
      chapterIndex,
      batchIndex,
      items: currentBatchItems,
      wordCount: currentBatchWords,
      status: 'pending',
      retryCount: 0
    });
  }

    return {
      title,
      wordCount: totalWordCount,
      batches,
      annotatedXhtml: $.xml()
    };
  } catch (err: any) {
    console.warn(`[Chapter ${chapterIndex}] Failed to parse XML: ${err.message}. Safely returning empty batches to save quota.`);
    return {
      title: `Chapter ${chapterIndex + 1}`,
      wordCount: 0,
      batches: [],
      annotatedXhtml: xhtml
    };
  }
}

/**
 * Replaces annotated elements in the XHTML with their translated content,
 * removing the temporary `data-lb-id` markers.
 */
export function reassembleXhtml(
  annotatedXhtml: string,
  translatedBatches: TranslationBatch[]
): string {
  const $ = cheerio.load(annotatedXhtml, { xml: true });

  // Map of item ID -> translated HTML
  const translationMap = new Map<string, string>();
  for (const batch of translatedBatches) {
    for (const item of batch.items) {
      if (item.translatedHtml) {
        translationMap.set(item.id, item.translatedHtml);
      }
    }
  }

  // Find all elements with data-lb-id
  $('[data-lb-id]').each((_, element) => {
    const el = $(element);
    const id = el.attr('data-lb-id');
    if (id && translationMap.has(id)) {
      const translatedHtml = translationMap.get(id)!;
      el.html(translatedHtml);
    }
    el.removeAttr('data-lb-id');
  });

  return $.xml();
}

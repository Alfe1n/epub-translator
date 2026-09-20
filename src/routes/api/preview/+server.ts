import { json, type RequestHandler } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import { getSession } from '$lib/translation/queue';
import { reassembleXhtml } from '$lib/translation/chunker';

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');
  const chapterParam = url.searchParams.get('chapterIndex');

  if (!sessionId) {
    return json({ error: 'sessionId is required.' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return json({ error: 'Session not found or expired.' }, { status: 404 });
  }

  const chapterIndex = chapterParam !== null ? parseInt(chapterParam, 10) : 0;
  const chapter = session.chapters[chapterIndex];

  if (!chapter) {
    return json({ error: `Chapter index ${chapterIndex} not found.` }, { status: 404 });
  }

  // Get original HTML body
  const $orig = cheerio.load(chapter.rawContent, { xml: true });
  // Strip any data-lb-id attributes for clean preview
  $orig('[data-lb-id]').removeAttr('data-lb-id');
  const originalBody = $orig('body').html() || $orig.root().html() || '';

  // Get translated HTML body
  let translatedBody = '';
  let isTranslated = false;

  if (chapter.translatedContent) {
    const $trans = cheerio.load(chapter.translatedContent, { xml: true });
    translatedBody = $trans('body').html() || $trans.root().html() || '';
    isTranslated = true;
  } else if (chapter.batches.some((b) => b.status === 'completed')) {
    // Partially translated
    const partialXhtml = reassembleXhtml(chapter.rawContent, chapter.batches);
    const $trans = cheerio.load(partialXhtml, { xml: true });
    translatedBody = $trans('body').html() || $trans.root().html() || '';
    isTranslated = chapter.batches.every((b) => b.status === 'completed');
  } else {
    translatedBody = originalBody;
    isTranslated = false;
  }

  return json({
    chapterIndex,
    title: chapter.title,
    totalChapters: session.chapters.length,
    isTranslated,
    status: chapter.status,
    originalHtml: originalBody,
    translatedHtml: translatedBody
  });
};

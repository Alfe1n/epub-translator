import JSZip from 'jszip';
import * as cheerio from 'cheerio';
import path from 'path';
import type {
  EpubMetadata,
  EpubManifestItem,
  EpubChapter
} from './types';
import { extractTranslatableBlocks } from '$lib/translation/chunker';

export interface ParsedEpub {
  opfPath: string;
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  totalWords: number;
  totalBatches: number;
}

/**
 * Normalizes relative paths within the zip archive
 */
function resolveZipPath(baseDir: string, relativePath: string): string {
  // Decode URI components in href (e.g. %20 -> space)
  const decoded = decodeURIComponent(relativePath);
  if (!baseDir || baseDir === '.' || baseDir === '/') {
    return decoded.replace(/^\//, '');
  }
  const joined = path.posix.join(baseDir, decoded);
  return joined.replace(/^\//, '');
}

/**
 * Parses an EPUB buffer and extracts metadata, spine, and chapter contents.
 */
export async function parseEpub(buffer: Buffer): Promise<{ zip: JSZip; parsed: ParsedEpub }> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Read META-INF/container.xml
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: META-INF/container.xml not found.');
  }

  const containerXml = await containerFile.async('string');
  const $container = cheerio.load(containerXml, { xml: true });
  const rootfileEl = $container('rootfile');
  const opfPath = rootfileEl.attr('full-path');

  if (!opfPath) {
    throw new Error('Invalid EPUB: No rootfile found in container.xml.');
  }

  // 2. Read OPF file
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}.`);
  }

  const opfDir = path.posix.dirname(opfPath);
  const opfXml = await opfFile.async('string');
  const $opf = cheerio.load(opfXml, { xml: true });

  // 3. Extract Metadata
  const metadataEl = $opf('metadata');
  const title =
    metadataEl.find('dc\\:title, title').first().text().trim() ||
    metadataEl.find('*').filter((_, el) => el.name.toLowerCase().endsWith('title')).first().text().trim() ||
    'Untitled Book';

  const creator =
    metadataEl.find('dc\\:creator, creator').first().text().trim() ||
    metadataEl.find('*').filter((_, el) => el.name.toLowerCase().endsWith('creator')).first().text().trim() ||
    'Unknown Author';

  const language =
    metadataEl.find('dc\\:language, language').first().text().trim() ||
    metadataEl.find('*').filter((_, el) => el.name.toLowerCase().endsWith('language')).first().text().trim() ||
    'en';

  const identifier =
    metadataEl.find('dc\\:identifier, identifier').first().text().trim() ||
    'urn:uuid:unknown';

  const description = metadataEl.find('dc\\:description, description').first().text().trim() || undefined;
  const publisher = metadataEl.find('dc\\:publisher, publisher').first().text().trim() || undefined;

  // 4. Extract Manifest Items
  const manifestMap = new Map<string, EpubManifestItem>();
  $opf('manifest > item').each((_, el) => {
    const $item = $opf(el);
    const id = $item.attr('id');
    const href = $item.attr('href');
    const mediaType = $item.attr('media-type');
    const properties = $item.attr('properties');

    if (id && href && mediaType) {
      manifestMap.set(id, { id, href, mediaType, properties });
    }
  });

  // 5. Detect Cover Image
  let coverHref: string | undefined;
  let coverBase64: string | undefined;
  let coverMediaType: string | undefined;

  // Method A: <meta name="cover" content="itemId"/>
  const metaCover = metadataEl.find('meta[name="cover"]').attr('content');
  if (metaCover && manifestMap.has(metaCover)) {
    const item = manifestMap.get(metaCover)!;
    coverHref = item.href;
    coverMediaType = item.mediaType;
  }

  // Method B: item with properties="cover-image"
  if (!coverHref) {
    for (const item of manifestMap.values()) {
      if (item.properties && item.properties.includes('cover-image')) {
        coverHref = item.href;
        coverMediaType = item.mediaType;
        break;
      }
    }
  }

  // Method C: manifest item id or href containing 'cover' and image media-type
  if (!coverHref) {
    for (const item of manifestMap.values()) {
      if (
        item.mediaType.startsWith('image/') &&
        (item.id.toLowerCase().includes('cover') || item.href.toLowerCase().includes('cover'))
      ) {
        coverHref = item.href;
        coverMediaType = item.mediaType;
        break;
      }
    }
  }

  // Load cover image as base64 data URI if found
  if (coverHref) {
    const coverFullPath = resolveZipPath(opfDir, coverHref);
    const coverZipFile = zip.file(coverFullPath);
    if (coverZipFile) {
      const coverBuffer = await coverZipFile.async('nodebuffer');
      const mime = coverMediaType || 'image/jpeg';
      coverBase64 = `data:${mime};base64,${coverBuffer.toString('base64')}`;
    }
  }

  const metadata: EpubMetadata = {
    title,
    creator,
    language,
    identifier,
    description,
    publisher,
    coverHref,
    coverBase64,
    coverMediaType
  };

  // 6. Process Spine Items
  const spineItemrefs = $opf('spine > itemref');
  const chapters: EpubChapter[] = [];
  let chapterIndex = 0;
  let totalWords = 0;
  let totalBatches = 0;

  for (let i = 0; i < spineItemrefs.length; i++) {
    const itemref = $opf(spineItemrefs[i]);
    const idref = itemref.attr('idref');
    if (!idref || !manifestMap.has(idref)) continue;

    const manifestItem = manifestMap.get(idref)!;
    // Only process HTML/XHTML content documents
    if (
      !manifestItem.mediaType.includes('html') &&
      !manifestItem.mediaType.includes('xml')
    ) {
      continue;
    }

    const fullPath = resolveZipPath(opfDir, manifestItem.href);
    const chapterFile = zip.file(fullPath);
    if (!chapterFile) continue;

    const rawContent = await chapterFile.async('string');
    const extracted = extractTranslatableBlocks(rawContent, chapterIndex);

    // Skip empty documents (e.g. blank pages or pure svg cover wrapper) if they have no translatable text
    if (extracted.batches.length === 0 && extracted.wordCount === 0) {
      // Still keep chapter record if it has images or content, or skip?
      // Keeping it ensures the spine integrity is 100% maintained!
    }

    totalWords += extracted.wordCount;
    totalBatches += extracted.batches.length;

    chapters.push({
      index: chapterIndex,
      id: manifestItem.id,
      href: manifestItem.href,
      fullPath,
      title: extracted.title,
      wordCount: extracted.wordCount,
      batches: extracted.batches,
      rawContent: extracted.annotatedXhtml,
      status: 'pending'
    });

    chapterIndex++;
  }

  return {
    zip,
    parsed: {
      opfPath,
      metadata,
      chapters,
      totalWords,
      totalBatches
    }
  };
}

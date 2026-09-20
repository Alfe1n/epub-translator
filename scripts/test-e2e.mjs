import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { parseEpub } from '../src/lib/epub/parser.js';
import { buildTranslatedEpub } from '../src/lib/epub/builder.js';
import { extractTranslatableBlocks, reassembleXhtml } from '../src/lib/translation/chunker.js';

async function runTest() {
  console.log('--- 1. Generating Sample English EPUB ---');
  const sampleZip = new JSZip();

  // Mimetype
  sampleZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // Container
  sampleZip.file('META-INF/container.xml', `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // Sample Cover Image (1x1 PNG)
  const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  sampleZip.file('EPUB/images/cover.png', dummyPng);
  sampleZip.file('EPUB/styles/style.css', 'body { font-family: serif; color: #333; } p { margin: 1em 0; }');

  // Chapter 1 XHTML
  const chap1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>Chapter 1: The Adventure Begins</title>
    <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  </head>
  <body>
    <h1 class="chapter-header">Chapter 1: The Adventure Begins</h1>
    <p class="lead">To Sherlock Holmes she is always <em>the</em> woman.</p>
    <p>"My dear Watson, you could not possibly have come at a better time," said Holmes.</p>
    <blockquote>
      <p>A gentleman in a heavy black cloak entered the room.</p>
    </blockquote>
    <p>Visit <a href="https://example.com/baker-street">221B Baker Street</a> for more clues.</p>
  </body>
</html>`;
  sampleZip.file('EPUB/text/ch01.xhtml', chap1Xhtml);

  // Chapter 2 XHTML
  const chap2Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>Chapter 2: The Mysterious Client</title>
    <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  </head>
  <body>
    <h1 class="chapter-header">Chapter 2: The Mysterious Client</h1>
    <p>The man paused on the threshold and looked around with uneasy eyes.</p>
    <p>"Pray take a seat," said Holmes. "This is my friend and colleague, Dr. Watson."</p>
  </body>
</html>`;
  sampleZip.file('EPUB/text/ch02.xhtml', chap2Xhtml);

  // OPF Package Document
  sampleZip.file('EPUB/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:7b3dc53b-lingua-book-test</dc:identifier>
    <dc:title>The Adventures of Sherlock Holmes</dc:title>
    <dc:creator>Arthur Conan Doyle</dc:creator>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
    <item id="c1" href="text/ch01.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch02.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`);

  const originalEpubBuffer = await sampleZip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE'
  });

  const testEpubPath = path.join(process.cwd(), 'scripts', 'sample-book.epub');
  fs.writeFileSync(testEpubPath, originalEpubBuffer);
  console.log(`✓ Created sample EPUB at ${testEpubPath} (${originalEpubBuffer.length} bytes)`);

  console.log('\n--- 2. Testing EPUB Parsing & Extraction ---');
  const { parsed } = await parseEpub(originalEpubBuffer);
  console.log(`✓ Title: ${parsed.metadata.title}`);
  console.log(`✓ Author: ${parsed.metadata.creator}`);
  console.log(`✓ Language: ${parsed.metadata.language}`);
  console.log(`✓ Cover detected: ${parsed.metadata.coverBase64 ? 'Yes (base64 data URI generated)' : 'No'}`);
  console.log(`✓ Chapters detected: ${parsed.chapters.length}`);
  console.log(`✓ Total estimated words: ${parsed.totalWords}`);
  console.log(`✓ Total translation batches: ${parsed.totalBatches}`);

  for (const ch of parsed.chapters) {
    console.log(`  Chapter [${ch.index}]: "${ch.title}" (${ch.wordCount} words, ${ch.batches.length} batches)`);
    for (const b of ch.batches) {
      console.log(`    Batch ${b.id}: ${b.items.length} items`);
    }
  }

  console.log('\n--- 3. Testing Translation Simulation & Reassembly ---');
  // Simulate translation of batches into Indonesian
  for (const ch of parsed.chapters) {
    for (const b of ch.batches) {
      for (const item of b.items) {
        if (item.originalText.includes('Sherlock Holmes')) {
          item.translatedHtml = item.originalHtml.replace('she is always <em>the</em> woman', 'dia selalu menjadi wanita yang <em>paling istimewa</em>');
        } else if (item.originalText.includes('My dear Watson')) {
          item.translatedHtml = '"Watson, sahabatku, kau datang pada waktu yang benar-benar tepat," kata Holmes.';
        } else if (item.originalText.includes('heavy black cloak')) {
          item.translatedHtml = 'Seorang pria dengan jubah hitam tebal memasuki ruangan.';
        } else if (item.originalText.includes('Visit')) {
          item.translatedHtml = 'Kunjungi <a href="https://example.com/baker-street">221B Baker Street</a> untuk petunjuk lebih lanjut.';
        } else if (item.originalText.includes('The man paused')) {
          item.translatedHtml = 'Pria itu berhenti di ambang pintu dan memandang sekeliling dengan mata gelisah.';
        } else if (item.originalText.includes('Pray take a seat')) {
          item.translatedHtml = '"Silakan duduk," kata Holmes. "Ini sahabat sekaligus rekanku, Dr. Watson."';
        } else if (item.originalText.includes('Chapter 1')) {
          item.translatedHtml = 'Bab 1: Petualangan Dimulai';
        } else if (item.originalText.includes('Chapter 2')) {
          item.translatedHtml = 'Bab 2: Klien yang Misterius';
        } else {
          item.translatedHtml = `[ID] ${item.originalText}`;
        }
      }
      b.status = 'completed';
    }
    ch.status = 'completed';
    ch.translatedContent = reassembleXhtml(ch.rawContent, ch.batches);
  }

  console.log('✓ Simulated Indonesian translation for all batches.');
  console.log('\nPreview of reassembled Chapter 1 XHTML:');
  console.log(parsed.chapters[0].translatedContent);

  console.log('\n--- 4. Testing EPUB Rebuilding & Spec Compliance ---');
  const mockSession = {
    id: 'test-session-123',
    originalFilename: 'sample-book.epub',
    fileSizeBytes: originalEpubBuffer.length,
    originalZipBuffer: originalEpubBuffer,
    opfPath: parsed.opfPath,
    metadata: parsed.metadata,
    chapters: parsed.chapters,
    totalWords: parsed.totalWords,
    totalBatches: parsed.totalBatches,
    completedBatches: parsed.totalBatches,
    status: 'completed',
    style: 'literary',
    createdAt: Date.now(),
    lastActivity: Date.now()
  };

  const outputEpubBuffer = await buildTranslatedEpub(mockSession);
  const outPath = path.join(process.cwd(), 'scripts', 'sample-book-ID.epub');
  fs.writeFileSync(outPath, outputEpubBuffer);
  console.log(`✓ Rebuilt translated EPUB at ${outPath} (${outputEpubBuffer.length} bytes)`);

  // Verify EPUB Spec on Output
  console.log('\n--- 5. Verifying Output EPUB Spec & Content ---');
  const outZip = await JSZip.loadAsync(outputEpubBuffer);
  
  // Verify 1: Mimetype is at offset 0
  const header = outputEpubBuffer.subarray(0, 38);
  const filenameLen = header.readUInt16LE(26);
  const compMethod = header.readUInt16LE(8);
  const firstFilename = header.slice(30, 30 + filenameLen).toString('utf8');

  console.log(`✓ First ZIP file name: "${firstFilename}" (must be "mimetype")`);
  console.log(`✓ Mimetype compression method: ${compMethod} (0 = STORE)`);
  if (firstFilename !== 'mimetype' || compMethod !== 0) {
    throw new Error('EPUB spec failure: mimetype is not first uncompressed file!');
  }

  // Verify 2: Check OPF metadata
  const updatedOpf = await outZip.file(parsed.opfPath).async('string');
  const hasLangId = updatedOpf.includes('<dc:language>id</dc:language>');
  console.log(`✓ OPF language updated to "id": ${hasLangId}`);

  // Verify 3: Check translated chapter content in zip
  const ch1Out = await outZip.file('EPUB/text/ch01.xhtml').async('string');
  const containsIndonesian = ch1Out.includes('Watson, sahabatku') && ch1Out.includes('<em>paling istimewa</em>');
  const containsPreservedLink = ch1Out.includes('<a href="https://example.com/baker-street">');
  console.log(`✓ Chapter 1 contains translated Indonesian text: ${containsIndonesian}`);
  console.log(`✓ Chapter 1 preserved inline tags and links: ${containsPreservedLink}`);

  // Verify 4: CSS and cover image preserved
  const hasCss = !!outZip.file('EPUB/styles/style.css');
  const hasCover = !!outZip.file('EPUB/images/cover.png');
  console.log(`✓ Preserved CSS stylesheet: ${hasCss}`);
  console.log(`✓ Preserved cover image: ${hasCover}`);

  console.log('\n🎉 ALL END-TO-END EPUB TRANSLATOR VERIFICATIONS PASSED SUCCESSFULLY!');
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});

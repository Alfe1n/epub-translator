import JSZip from 'jszip';

const zip = new JSZip();

// Add mimetype as the first entry uncompressed
zip.file('mimetype', 'application/epub+zip', {
  compression: 'STORE'
});

zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:12345</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`);

zip.file('OEBPS/c1.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body><p>Hello world!</p></body>
</html>`);

const buffer = await zip.generateAsync({
  type: 'nodebuffer',
  mimeType: 'application/epub+zip',
  compression: 'DEFLATE'
});

console.log('Generated EPUB buffer length:', buffer.length);
// Verify first 30 bytes:
// In a ZIP file:
// Local file header signature: 50 4B 03 04
// Filename length at offset 26 (2 bytes): should be 8 (length of "mimetype")
// Filename at offset 30: "mimetype"
const header = buffer.subarray(0, 38);
console.log('Magic bytes (PK 3 4):', header.slice(0, 4));
console.log('Filename length:', header.readUInt16LE(26));
console.log('Filename:', header.slice(30, 38).toString('utf8'));
// Check compression method at offset 8 (2 bytes): 0 = STORE
console.log('Compression method for mimetype:', header.readUInt16LE(8), '(0 = STORE)');

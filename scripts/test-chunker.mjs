import { extractTranslatableBlocks, reassembleXhtml } from '../src/lib/translation/chunker.js';

const sampleXhtml = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1: A Scandal in Bohemia</title></head>
  <body>
    <div class="chapter">
      <h1 class="chapter-title">A Scandal in Bohemia</h1>
      <p class="first">To Sherlock Holmes she is always <em>the</em> woman.</p>
      <p>I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.</p>
      <blockquote>
        <p>"Good morning, Watson," said he.</p>
      </blockquote>
      <img src="images/sherlock.jpg" alt="Sherlock Holmes" />
    </div>
  </body>
</html>`;

console.log('Testing block extraction...');
// Note: using transpile or run via tsx/node or verify types

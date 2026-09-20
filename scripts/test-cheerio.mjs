import * as cheerio from 'cheerio';

const sampleXhtml = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns='http://www.w3.org/1999/xhtml'>
  <head><title>Chapter 1: The Beginning</title></head>
  <body>
    <div class='chapter'>
      <h1 class='title'>Chapter 1</h1>
      <p class='intro'>"My dear <em>Watson</em>," said Holmes, "look at <a href='ref.html'>this</a>."</p>
      <div class='dialogue'>
        <p>It was a cold, foggy night in London.</p>
      </div>
      <img src='images/pic1.jpg' alt='London in fog'/>
    </div>
  </body>
</html>`;

const $ = cheerio.load(sampleXhtml, { xmlMode: true, decodeEntities: false });

console.log('Title:', $('title').text());
$('p, h1').each((i, el) => {
  console.log('Block', i, 'html:', $(el).html());
  $(el).html('TERJEMAHAN: ' + $(el).html());
});

console.log('--- Result XML ---');
console.log($.xml());

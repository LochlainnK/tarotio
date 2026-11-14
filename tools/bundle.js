#!/usr/bin/env node
/*
 * Builds dist/tarotio.html: the whole game in one file, with styles.css and the
 * four scripts inlined. Useful for embedding or for hosts that take a single file.
 *   npm run bundle
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, () => '<style>\n' + read('styles.css') + '</style>');
html = html.replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (m, src) =>
  '<script>\n' + read(src).replace(/<\/script/gi, '<\\/script') + '</script>');

if (/href="styles\.css"|src="js\//.test(html)) {
  console.error('bundle: a local file was not inlined. Check the tags in index.html.');
  process.exit(1);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'tarotio.html'), html);
console.log('dist/tarotio.html written, ' + Math.round(html.length / 1024) + ' KB');

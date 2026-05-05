const sharp = require('sharp');
const path  = require('path');
const outDir = path.join(__dirname, 'public', 'icons');

const svg = Buffer.from([
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
  '<rect width="512" height="512" rx="102" fill="#6c63ff"/>',
  '<text x="256" y="320" font-family="Arial,sans-serif" font-size="300" font-weight="bold" fill="white" text-anchor="middle">P</text>',
  '</svg>'
].join(''));

Promise.all([
  sharp(svg).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png')),
  sharp(svg).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'))
]).then(() => console.log('Icones gerados com sucesso!'))
  .catch(err => console.error('Erro:', err.message));

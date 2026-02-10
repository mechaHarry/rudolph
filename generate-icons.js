/**
 * Generate PNG icons for the Chrome extension.
 * Run once: node generate-icons.js
 * Requires no dependencies — uses the built-in OffscreenCanvas polyfill via a
 * minimal PNG encoder written in pure Node.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  // Cisco blue background (#049fd9) with white bridge bars
  const bg = [4, 159, 217];   // #049fd9
  const fg = [255, 255, 255]; // white

  const pixels = Buffer.alloc(size * size * 4);

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4]     = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = 255;
  }

  // Draw simplified Cisco bridge icon (5 vertical bars at different heights)
  const barWidth = Math.max(1, Math.round(size / 12));
  const gap = Math.round(size / 8);
  const bars = [
    { h: 0.30 },  // short
    { h: 0.45 },  // medium
    { h: 0.60 },  // tall
    { h: 0.45 },  // medium
    { h: 0.30 },  // short
  ];
  const totalW = bars.length * barWidth + (bars.length - 1) * Math.max(1, Math.round(gap * 0.4));
  let startX = Math.round((size - totalW) / 2);
  const bottomY = Math.round(size * 0.78);

  bars.forEach(function(bar) {
    const barH = Math.round(size * bar.h);
    const topY = bottomY - barH;
    for (let y = topY; y < bottomY; y++) {
      for (let x = startX; x < startX + barWidth && x < size; x++) {
        if (y >= 0 && y < size && x >= 0) {
          const idx = (y * size + x) * 4;
          pixels[idx]     = fg[0];
          pixels[idx + 1] = fg[1];
          pixels[idx + 2] = fg[2];
          pixels[idx + 3] = 255;
        }
      }
    }
    startX += barWidth + Math.max(1, Math.round(gap * 0.4));
  });

  // Encode as PNG
  return encodePNG(size, size, pixels);
}

function encodePNG(w, h, pixels) {
  // Build raw image data with filter byte (0 = None) per row
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    pixels.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }

  const compressed = zlib.deflateSync(raw);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = crc32(crcData);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(function(size) {
  const png = createPNG(size);
  const out = path.join(iconsDir, 'icon' + size + '.png');
  fs.writeFileSync(out, png);
  console.log('Created ' + out + ' (' + png.length + ' bytes)');
});

console.log('Done! Icons generated in icons/');

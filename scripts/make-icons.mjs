// Draws the extension icons (a red ring and a white dot on a dark rounded square: where the agent's
// action lands) without any image library. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const RED = [225, 6, 0];
const DARK = [20, 32, 43];
const WHITE = [255, 255, 255];
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) { c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); }
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2;
  const outer = size * 0.36;
  const inner = size * 0.25;
  const dot = size * 0.11;
  const SS = 4; // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // Each subsample is the dark tile, the red ring, the white dot, or empty; the pixel is their average.
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const d = Math.hypot(px - c, py - c);
          const r = size * 0.22;
          const qx = Math.max(Math.abs(px - c) - (c - r), 0);
          const qy = Math.max(Math.abs(py - c) - (c - r), 0);
          if (Math.hypot(qx, qy) > r) { continue; }
          const colour = d <= dot ? WHITE : d <= outer && d >= inner ? RED : DARK;
          sum[0] += colour[0]; sum[1] += colour[1]; sum[2] += colour[2]; sum[3]++;
        }
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const n = Math.max(sum[3], 1);
      raw[i] = Math.round(sum[0] / n); raw[i + 1] = Math.round(sum[1] / n); raw[i + 2] = Math.round(sum[2] / n);
      raw[i + 3] = Math.round((sum[3] / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../extension/icons/${size}.png`, import.meta.url), icon(size));
}

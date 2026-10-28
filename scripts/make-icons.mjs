// Draws the extension icons without any image library: a white pointer acting on a red-outlined target,
// on a dark rounded tile. It is the overlay itself, as the developer sees it on the page.
// Run: node scripts/make-icons.mjs
//
// Shapes are described on a 128-unit grid and sampled per pixel (4x4 supersampling for smooth edges).
// The 16px icon is drawn from its own, bolder layout rather than shrunk, so the pointer and the outline
// stay two clear shapes in Chrome's toolbar.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TILE = [27, 42, 56];
const EDGE = [58, 75, 90];
const RED = [225, 6, 0];
const WHITE = [255, 255, 255];
const ARROW = [[0, 0], [0, 50], [13, 38], [22, 58], [32, 54], [23, 34], [40, 34]];

// Per size: the target box (x, y, w, h, corner radius, stroke) and the pointer (tip x, y, scale), in
// 128-unit coordinates.
const LAYOUT = {
  default: { box: [20, 26, 72, 50, 9, 10], pointer: [68, 56, 1.05], keyline: 6 },
  16: { box: [14, 18, 78, 54, 10, 16], pointer: [62, 50, 1.35], keyline: 8 },
};

// Signed distance to a rounded rectangle: negative inside, positive outside.
function roundRect(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function insidePolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) { inside = !inside; }
  }
  return inside;
}

function distanceToPolygon(px, py, points) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j];
    const [bx, by] = points[i];
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
  }
  return best;
}

// The colour at one point of the 128-unit grid, or null outside the tile.
function colourAt(px, py, layout) {
  const tile = roundRect(px, py, 3, 3, 122, 122, 28);
  if (tile > 0) { return null; }
  const [tx, ty, scale] = layout.pointer;
  const arrow = ARROW.map(([x, y]) => [tx + x * scale, ty + y * scale]);
  const toArrow = distanceToPolygon(px, py, arrow);
  if (toArrow <= layout.keyline / 2) { return TILE; }
  if (insidePolygon(px, py, arrow)) { return WHITE; }
  const [bx, by, bw, bh, br, stroke] = layout.box;
  if (Math.abs(roundRect(px, py, bx, by, bw, bh, br)) <= stroke / 2) { return RED; }
  return tile > -2 ? EDGE : TILE;
}

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
  const layout = LAYOUT[size] || LAYOUT.default;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // The pixel is the average of its subsamples; those outside the tile are transparent.
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const colour = colourAt(((x + (sx + 0.5) / SS) * 128) / size, ((y + (sy + 0.5) / SS) * 128) / size, layout);
          if (!colour) { continue; }
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

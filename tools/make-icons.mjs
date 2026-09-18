/**
 * Generates the extension icons as PNG files without any dependency:
 * a rounded sky-blue tile with a white camera lens.
 *
 *   node tools/make-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const TILE = [14, 165, 233];      // #0ea5e9
const TILE_DARK = [2, 132, 199];  // #0284c7
const WHITE = [255, 255, 255];
const INK = [15, 23, 42];         // #0f172a

function roundedRectDistance(x, y, half, radius) {
  const qx = Math.abs(x) - half + radius;
  const qy = Math.abs(y) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Color of the icon at normalized coordinates (-1..1). Returns [r,g,b,a]. */
function shade(x, y) {
  const tile = roundedRectDistance(x, y, 1, 0.28);
  if (tile > 0) return [0, 0, 0, 0];

  const gradient = (y + 1) / 2;
  const base = TILE.map((channel, index) => channel + (TILE_DARK[index] - channel) * gradient);

  const lensRadius = 0.46;
  const ring = Math.abs(Math.hypot(x, y + 0.04) - lensRadius);
  if (ring < 0.11) return [...WHITE, 255];

  const pupil = Math.hypot(x, y + 0.04);
  if (pupil < 0.2) return [...INK, 255];

  const flash = Math.hypot(x - 0.62, y + 0.62);
  if (flash < 0.11) return [...WHITE, 255];

  const shutter = roundedRectDistance(x, y + 0.79, 0.34, 0.06) ;
  if (shutter < 0 && Math.abs(x) < 0.34 && y + 0.79 > -0.09 && y + 0.79 < 0.09) return [...WHITE, 255];

  return [...base, 255];
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const accumulator = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
          const [r, g, b, a] = shade(x, y);
          accumulator[0] += r * a;
          accumulator[1] += g * a;
          accumulator[2] += b * a;
          accumulator[3] += a;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const alpha = accumulator[3] / samples;
      const offset = (py * size + px) * 4;
      pixels[offset] = alpha ? Math.round(accumulator[0] / accumulator[3]) : 0;
      pixels[offset + 1] = alpha ? Math.round(accumulator[1] / accumulator[3]) : 0;
      pixels[offset + 2] = alpha ? Math.round(accumulator[2] / accumulator[3]) : 0;
      pixels[offset + 3] = Math.round(alpha);
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(root, "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, encodePng(size, renderIcon(size)));
  console.log("wrote", path.relative(root, file));
}

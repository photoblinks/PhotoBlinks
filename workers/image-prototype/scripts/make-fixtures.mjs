import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { optimizeImage } from "wasm-image-optimization";

// Generates deterministic gradient PNG fixtures (pure Node zlib), then uses
// the WASM library to derive JPEG and WebP source fixtures from them.

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(width, height) {
  const stride = 1 + width * 3; // filter byte + RGB
  const raw = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    const gy = Math.floor((255 * y) / Math.max(1, height - 1));
    for (let x = 0; x < width; x++) {
      const gx = Math.floor((255 * x) / Math.max(1, width - 1));
      raw[p++] = gx;
      raw[p++] = gy;
      raw[p++] = (gx + gy) >> 1;
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk("IHDR", (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(width, 0);
    b.writeUInt32BE(height, 4);
    b[8] = 8; // bit depth
    b[9] = 2; // truecolor
    return b;
  })());
  const idat = chunk("IDAT", deflateSync(raw, { level: 6 }));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const sizes = [
  [8, 6, "8x6"],
  [64, 48, "64x48"],
  [640, 480, "640x480"],
  [1920, 1080, "1920x1080"],
];

const fixturesDir = new URL("../fixtures/", import.meta.url);
mkdirSync(fixturesDir, { recursive: true });

// 1) PNG sources (pure zlib)
for (const [w, h, label] of sizes) {
  const png = makePng(w, h);
  writeFileSync(new URL(`png-${label}.png`, fixturesDir), png);
  console.log(`wrote png-${label}.png (${w}x${h}, ${png.length} bytes)`);
}

// 2) JPEG and WebP sources derived from the medium+ PNGs (real encode)
for (const [w, h, label] of sizes.slice(1)) {
  const png = readFileSync(new URL(`png-${label}.png`, fixturesDir));
  for (const [fmt, quality] of [["jpeg", 85], ["webp", 80]]) {
    const r = await optimizeImage({ image: png, format: fmt, quality, animation: false });
    writeFileSync(new URL(`${fmt}-${label}.${fmt === "jpeg" ? "jpg" : "webp"}`, fixturesDir), Buffer.from(r.data));
    console.log(`wrote ${fmt}-${label} (${r.width}x${r.height}, result.format=${r.format}, ${r.data.length} bytes)`);
  }
}

// Remove the obsolete Phase 3 1x1 fixture if present.
for (const legacy of ["photo.png"]) {
  const p = new URL(legacy, fixturesDir);
  if (existsSync(p)) unlinkSync(p);
}
console.log("done");

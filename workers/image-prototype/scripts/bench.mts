// Phase 6 benchmark. Node wall-clock only; NOT Cloudflare CPU time.
// Usage: npx tsx scripts/bench.mts [extra-input-file ...]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { transformImage } from "../src/transform";
import { getImageDimensions } from "../src/dimensions";
import { ALLOWED_WIDTHS } from "../src/config";

const SAMPLES = 10;
const files = [
  ...["png-8x6.png", "jpeg-64x48.jpg", "webp-64x48.webp", "png-640x480.png", "jpeg-640x480.jpg", "webp-640x480.webp", "png-1920x1080.png", "jpeg-1920x1080.jpg", "webp-1920x1080.webp"].map((n) => new URL(`../fixtures/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ...process.argv.slice(2),
];
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows: string[] = [];
let first = true;
for (const f of files) {
  const input = new Uint8Array(readFileSync(f));
  const d = getImageDimensions(input)!;
  for (const format of ["webp", "jpeg"] as const) {
    for (const width of [...ALLOWED_WIDTHS]) {
      const t: number[] = [];
      let out = { width: 0, height: 0, bytes: 0 };
      let err = "";
      const cold = first;
      first = false;
      for (let i = 0; i < SAMPLES; i++) {
        const s = performance.now();
        try {
          const r = await transformImage(input, width, format, 80);
          out = { width: r.width, height: r.height, bytes: r.data.byteLength };
        } catch (e) { err = String(e); break; }
        t.push(performance.now() - s);
      }
      rows.push(JSON.stringify({ input: basename(f), inFmt: basename(f).split(".").pop(), inDims: `${d.width}x${d.height}`, inBytes: input.byteLength, outFmt: format, q: 80, reqW: width, outDims: `${out.width}x${out.height}`, outBytes: out.bytes, n: t.length, firstMs: +t[0]?.toFixed(1), medianMs: t.length ? +med(t).toFixed(1) : null, minMs: t.length ? +Math.min(...t).toFixed(1) : null, maxMs: t.length ? +Math.max(...t).toFixed(1) : null, coldProcess: cold, err }));
    }
  }
}
console.log(rows.join("\n"));

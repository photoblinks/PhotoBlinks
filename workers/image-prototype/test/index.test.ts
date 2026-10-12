import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index";
import { transformImage } from "../src/transform";
import { getImageDimensions } from "../src/dimensions";
import { cacheKey } from "../src/cache";
import { VERSION } from "../src/config";
import { optimizeImage } from "wasm-image-optimization";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

const PNG_MED = fixture("png-640x480.png"); // 640x480
const PNG_SMALL = fixture("png-8x6.png"); // 8x6 (for no-upscale test)
const JPG_MED = fixture("jpeg-640x480.jpg");
const WEBP_MED = fixture("webp-640x480.webp");
const PNG_LARGE = fixture("png-1920x1080.png");

function fakeR2Object(body: Uint8Array, size = body.byteLength) {
  return { size, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer };
}
function makeEnv(entries: Record<string, Uint8Array> = {}, token?: string) {
  const env = {
    IMAGES: { get: async (k: string) => (k in entries ? fakeR2Object(entries[k]) : null) },
    ...(token ? { ACCESS_TOKEN: token } : {}),
  };
  return env as unknown as { IMAGES: R2Bucket; ACCESS_TOKEN?: string };
}
const ctx = { waitUntil: async (_p: Promise<unknown>) => {} } as unknown as ExecutionContext;
const req = (path: string, headers: Record<string, string> = {}): Request =>
  new Request(`https://example.test${path}`, { headers });

// ---- Handler: routing, validation, auth, R2, caching ----

test("health endpoint returns 200 and version", async () => {
  const res = await worker.fetch(req("/_health"), makeEnv(), ctx);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; version: string };
  assert.equal(body.ok, true);
  assert.equal(body.version, VERSION);
});

test("valid route returns 200 with real transformed WebP (downscale 640->160)", async () => {
  const res = await worker.fetch(
    req("/w/160/webp/80/locations/test/photo.png"),
    makeEnv({ "locations/test/photo.png": PNG_MED }),
    ctx,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/webp");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(res.headers.has("X-Image-Prototype"), false, "placeholder header removed");
  const out = new Uint8Array(await res.arrayBuffer());
  assert.ok(out.length < PNG_MED.length, "output smaller than source");
  assert.equal(String.fromCharCode(out[0], out[1], out[2], out[3]), "RIFF", "valid WebP signature");
  // decode the output to verify dimensions and format
  const meta = await optimizeImage({ image: out, format: "none" });
  assert.equal(meta.originalWidth, 160);
  assert.equal(meta.originalHeight, 120);
});

test("no upscaling: 8x6 source requested at width 160 stays 8x6", async () => {
  const res = await worker.fetch(
    req("/w/160/webp/80/locations/test/small.png"),
    makeEnv({ "locations/test/small.png": PNG_SMALL }),
    ctx,
  );
  assert.equal(res.status, 200);
  const out = new Uint8Array(await res.arrayBuffer());
  const meta = await optimizeImage({ image: out, format: "none" });
  assert.equal(meta.originalWidth, 8);
  assert.equal(meta.originalHeight, 6);
});

test("corrupt source bytes return 422, never the original", async () => {
  const garbage = new Uint8Array(128).fill(7);
  const res = await worker.fetch(
    req("/w/160/webp/80/locations/test/broken.png"),
    makeEnv({ "locations/test/broken.png": garbage }),
    ctx,
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json() as { error: string }).error, "transform_failed");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("access token is enforced when configured", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED }, "sekret");
  assert.equal((await worker.fetch(req("/w/160/webp/80/locations/test/photo.png"), env, ctx)).status, 401);
  const ok = await worker.fetch(
    req("/w/160/webp/80/locations/test/photo.png", { Authorization: "Bearer sekret" }),
    env,
    ctx,
  );
  assert.equal(ok.status, 200);
});

test("rejects disallowed width, format, and quality", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED });
  assert.equal((await worker.fetch(req("/w/500/webp/80/locations/test/photo.png"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/w/640/png/80/locations/test/photo.png"), env, ctx)).status, 400); // png no longer allowed
  assert.equal((await worker.fetch(req("/w/640/avif/80/locations/test/photo.png"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/w/640/webp/99/locations/test/photo.png"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/w/640/webp/10/locations/test/photo.png"), env, ctx)).status, 400);
});

test("rejects malformed paths and keys", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED });
  assert.equal((await worker.fetch(req("/w/640/webp/80/other/photo.png"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/w/640/webp/80/locations/../secret.png"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/w/640/webp/80/locations/test/photo.gif"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/not-a-route"), env, ctx)).status, 400);
});

test("missing object returns 404 with no-store", async () => {
  const res = await worker.fetch(req("/w/640/webp/80/locations/test/missing.png"), makeEnv(), ctx);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("oversized input returns 413", async () => {
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  const res = await worker.fetch(req("/w/640/webp/80/locations/test/big.png"), makeEnv({ "locations/test/big.png": big }), ctx);
  assert.equal(res.status, 413);
});

test("error responses are never cached; success responses are cached", async () => {
  const putKeys: string[] = [];
  const fakeCache = { match: async () => undefined, put: async (k: string) => { putKeys.push(k); } };
  (globalThis as unknown as { caches: { default: typeof fakeCache } }).caches = { default: fakeCache };

  const env = makeEnv({ "locations/test/photo.png": PNG_MED });
  await worker.fetch(req("/w/640/webp/80/locations/test/missing.png"), env, ctx);
  assert.equal(putKeys.length, 0, "404 must not be cached");

  await worker.fetch(req("/w/160/webp/80/locations/test/photo.png"), env, ctx);
  assert.equal(putKeys.length, 1, "200 must be cached once");
  assert.equal(putKeys[0], cacheKey(160, "webp", 80, "locations/test/photo.png"));

  delete (globalThis as unknown as { caches?: unknown }).caches;
});

test("cache keys are deterministic and separated by every parameter", () => {
  const base = cacheKey(640, "webp", 80, "locations/a.png");
  assert.equal(base, cacheKey(640, "webp", 80, "locations/a.png"));
  assert.notEqual(base, cacheKey(641, "webp", 80, "locations/a.png"));
  assert.notEqual(base, cacheKey(640, "jpeg", 80, "locations/a.png"));
  assert.notEqual(base, cacheKey(640, "webp", 85, "locations/a.png"));
  assert.notEqual(base, cacheKey(640, "webp", 80, "locations/b.png"));
  assert.ok(base.includes(VERSION));
});

// ---- Phase 5: cache behavior (in-memory Cache API fake; R2 gets stand in for transform calls) ----

type G = { caches?: { default: unknown } };
function memoryCache(opts: { failMatch?: boolean; failPut?: boolean } = {}) {
  const store = new Map<string, { status: number; headers: [string, string][]; body: Uint8Array }>();
  const stats = { match: 0, put: 0 };
  const cache = {
    async match(k: string) {
      stats.match++;
      if (opts.failMatch) throw new Error("cache read boom");
      const e = store.get(k);
      return e ? new Response(e.body.slice(), { status: e.status, headers: e.headers }) : undefined;
    },
    async put(k: string, r: Response) {
      stats.put++;
      if (opts.failPut) throw new Error("cache write boom");
      store.set(k, { status: r.status, headers: [...r.headers], body: new Uint8Array(await r.arrayBuffer()) });
    },
  };
  return { cache, store, stats };
}
function countingEnv(entries: Record<string, Uint8Array>, token?: string) {
  const env = makeEnv(entries, token);
  const counter = { gets: 0 };
  const inner = env.IMAGES.get.bind(env.IMAGES);
  (env.IMAGES as unknown as { get: unknown }).get = async (k: string) => { counter.gets++; return inner(k); };
  return { env, counter };
}
// Lets tests await cache.put (production uses ctx.waitUntil).
function trackingCtx() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p); } } as unknown as ExecutionContext, settle: () => Promise.all(pending) };
}
async function withCache<T>(cache: unknown, fn: () => Promise<T>): Promise<T> {
  (globalThis as unknown as G).caches = { default: cache };
  try { return await fn(); } finally { delete (globalThis as unknown as G).caches; }
}
const P = "/w/160/webp/80/locations/test/photo.png";

test("cache hit: identical request skips R2 read and transform, same bytes and headers", async () => {
  const { cache, stats } = memoryCache();
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED });
  await withCache(cache, async () => {
    const t = trackingCtx();
    const miss = await worker.fetch(req(P), env, t.ctx);
    await t.settle();
    const missBytes = new Uint8Array(await miss.arrayBuffer());
    assert.equal(counter.gets, 1);
    assert.equal(stats.put, 1);

    const hit = await worker.fetch(req(P), env, t.ctx);
    const hitBytes = new Uint8Array(await hit.arrayBuffer());
    assert.equal(counter.gets, 1, "hit must not read R2 (so no decode/transform)");
    assert.equal(stats.put, 1, "hit must not rewrite the cache");
    assert.equal(hit.status, 200);
    assert.deepEqual(hitBytes, missBytes);
    for (const r of [miss, hit]) {
      assert.equal(r.headers.get("Content-Type"), "image/webp");
      assert.equal(r.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    }
    console.log(`# phase5 evidence: 2 identical requests -> R2 reads/transforms=${counter.gets}, cache match=${stats.match}, put=${stats.put}`);
  });
});

test("cache hit survives source removal (proves transform path not taken)", async () => {
  const { cache } = memoryCache();
  await withCache(cache, async () => {
    const t = trackingCtx();
    await worker.fetch(req(P), makeEnv({ "locations/test/photo.png": PNG_MED }), t.ctx);
    await t.settle();
    const hit = await worker.fetch(req(P), makeEnv(), t.ctx); // R2 now empty
    assert.equal(hit.status, 200);
  });
});

test("different width/format/quality/key do not collide in cache", async () => {
  const { cache, store } = memoryCache();
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED, "locations/test/other.png": PNG_SMALL });
  await withCache(cache, async () => {
    const t = trackingCtx();
    const paths = [
      "/w/160/webp/80/locations/test/photo.png",
      "/w/400/webp/80/locations/test/photo.png",
      "/w/160/jpeg/80/locations/test/photo.png",
      "/w/160/webp/70/locations/test/photo.png",
      "/w/160/webp/80/locations/test/other.png",
    ];
    for (const p of paths) {
      const r = await worker.fetch(req(p), env, t.ctx);
      await t.settle();
      assert.equal(r.status, 200, p);
    }
    assert.equal(counter.gets, paths.length, "each distinct variant is a miss");
    assert.equal(store.size, paths.length, "each variant has its own entry");
    const jpeg = await worker.fetch(req(paths[2]), env, t.ctx);
    assert.equal(jpeg.headers.get("Content-Type"), "image/jpeg");
    assert.equal(counter.gets, paths.length, "jpeg hit does not read R2");
  });
});

test("equivalent paths (leading zeros, format case, query string) share one cache entry", async () => {
  const { cache, store } = memoryCache();
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED });
  await withCache(cache, async () => {
    const t = trackingCtx();
    await worker.fetch(req(P), env, t.ctx);
    await t.settle();
    await worker.fetch(req("/w/0160/WEBP/080/locations/test/photo.png?utm=x"), env, t.ctx);
    assert.equal(counter.gets, 1);
    assert.equal(store.size, 1);
  });
});

test("cache keys: version and literal percent in object key are separated", () => {
  const a = cacheKey(160, "webp", 80, "locations/a/b.png");
  assert.notEqual(a, cacheKey(160, "webp", 80, "locations/a%2Fb.png"));
  assert.notEqual(cacheKey(160, "webp", 80, "locations/%41.png"), cacheKey(160, "webp", 80, "locations/A.png"));
  assert.ok(a.includes(`/${VERSION}/`));
  assert.notEqual(a, a.replace(`/${VERSION}/`, "/v999/"));
});

test("failed transform, missing object, invalid request, oversize never populate cache", async () => {
  const { cache, store, stats } = memoryCache();
  const { env } = countingEnv({
    "locations/test/broken.png": new Uint8Array(128).fill(7),
    "locations/test/big.png": new Uint8Array(10 * 1024 * 1024 + 1),
  });
  await withCache(cache, async () => {
    const t = trackingCtx();
    const statuses = [
      (await worker.fetch(req("/w/160/webp/80/locations/test/broken.png"), env, t.ctx)).status,
      (await worker.fetch(req("/w/160/webp/80/locations/test/missing.png"), env, t.ctx)).status,
      (await worker.fetch(req("/w/500/webp/80/locations/test/missing.png"), env, t.ctx)).status,
      (await worker.fetch(req("/w/160/webp/80/locations/../x.png"), env, t.ctx)).status,
      (await worker.fetch(req("/w/160/webp/80/locations/test/big.png"), env, t.ctx)).status,
    ];
    await t.settle();
    assert.deepEqual(statuses, [422, 404, 400, 400, 413]);
    assert.equal(stats.put, 0);
    assert.equal(store.size, 0);
  });
});

test("auth failure is not bypassed by a warm cache", async () => {
  const { cache } = memoryCache();
  await withCache(cache, async () => {
    const t = trackingCtx();
    await worker.fetch(req(P), makeEnv({ "locations/test/photo.png": PNG_MED }), t.ctx); // warms cache without token
    await t.settle();
    const secured = makeEnv({ "locations/test/photo.png": PNG_MED }, "sekret");
    assert.equal((await worker.fetch(req(P), secured, t.ctx)).status, 401);
    assert.equal((await worker.fetch(req(P, { Authorization: "Bearer wrong" }), secured, t.ctx)).status, 401);
  });
});

test("access-controlled mode bypasses shared cache and marks responses private", async () => {
  const { cache, stats } = memoryCache();
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED }, "sekret");
  await withCache(cache, async () => {
    const t = trackingCtx();
    const h = { Authorization: "Bearer sekret" };
    const r1 = await worker.fetch(req(P, h), env, t.ctx);
    await t.settle();
    const r2 = await worker.fetch(req(P, h), env, t.ctx);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r1.headers.get("Cache-Control"), "private, no-store");
    assert.equal(stats.match + stats.put, 0, "shared cache never touched");
    assert.equal(counter.gets, 2);
  });
});

test("cache read failure degrades to a miss with a correct response", async () => {
  const { cache } = memoryCache({ failMatch: true });
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED });
  await withCache(cache, async () => {
    const res = await worker.fetch(req(P), env, trackingCtx().ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "image/webp");
    assert.equal(counter.gets, 1);
  });
});

test("cache write failure does not affect the response or reject waitUntil", async () => {
  const { cache } = memoryCache({ failPut: true });
  const { env } = countingEnv({ "locations/test/photo.png": PNG_MED });
  await withCache(cache, async () => {
    const t = trackingCtx();
    const res = await worker.fetch(req(P), env, t.ctx);
    await t.settle(); // rejects if the put failure leaked
    assert.equal(res.status, 200);
    assert.ok((await res.arrayBuffer()).byteLength > 0);
  });
});

test("non-200 cached entry is ignored", async () => {
  const { cache, store } = memoryCache();
  store.set(cacheKey(160, "webp", 80, "locations/test/photo.png"), { status: 404, headers: [], body: new Uint8Array([1]) });
  const { env, counter } = countingEnv({ "locations/test/photo.png": PNG_MED });
  await withCache(cache, async () => {
    const res = await worker.fetch(req(P), env, trackingCtx().ctx);
    assert.equal(res.status, 200);
    assert.equal(counter.gets, 1);
  });
});

// ---- transformImage: formats, aspect ratio, quality ----

test("transformImage produces correct JPEG and WebP with preserved aspect ratio", async () => {
  for (const src of [PNG_MED, JPG_MED, WEBP_MED]) {
    const jpeg = await transformImage(src, 400, "jpeg", 80);
    assert.equal(jpeg.width, 400);
    assert.equal(jpeg.height, 300); // 640x480 -> 400x300
    assert.equal(jpeg.format, "jpeg");
    assert.equal(jpeg.data[0], 0xff);
    assert.equal(jpeg.data[1], 0xd8);

    const webp = await transformImage(src, 400, "webp", 80);
    assert.equal(webp.width, 400);
    assert.equal(webp.height, 300);
    assert.equal(webp.format, "webp");
    assert.equal(String.fromCharCode(webp.data[0], webp.data[1], webp.data[2], webp.data[3]), "RIFF");
  }
});

test("quality changes output size", async () => {
  const low = await transformImage(PNG_LARGE, 800, "jpeg", 45);
  const high = await transformImage(PNG_LARGE, 800, "jpeg", 90);
  assert.ok(low.data.length < high.data.length, `q45 (${low.data.length}) < q90 (${high.data.length})`);
});

test("no-upscale guard clamps width to original", async () => {
  const r = await transformImage(PNG_SMALL, 1920, "webp", 80);
  assert.equal(r.width, 8);
  assert.equal(r.height, 6);
});

// ---- dimension parser cross-validation against the WASM decoder ----

test("getImageDimensions agrees with the WASM decoder for every fixture", async () => {
  const names = [
    "png-8x6.png", "png-64x48.png", "png-640x480.png", "png-1920x1080.png",
    "jpeg-64x48.jpg", "jpeg-640x480.jpg", "jpeg-1920x1080.jpg",
    "webp-64x48.webp", "webp-640x480.webp", "webp-1920x1080.webp",
  ];
  for (const name of names) {
    const bytes = fixture(name);
    const parsed = getImageDimensions(bytes);
    const decoded = await optimizeImage({ image: bytes, format: "none" });
    assert.ok(parsed, `${name}: parser returned null`);
    assert.equal(parsed!.width, decoded.originalWidth, `${name}: width`);
    assert.equal(parsed!.height, decoded.originalHeight, `${name}: height`);
  }
});

test("getImageDimensions returns null for corrupt bytes", () => {
  assert.equal(getImageDimensions(new Uint8Array([1, 2, 3, 4, 5])), null);
  assert.equal(getImageDimensions(new Uint8Array(128).fill(0)), null);
});

// ---- Phase 6: security and resource guards ----

function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

test("decompression-bomb header (declared > MAX_INPUT_PIXELS) is rejected 413 before decode", async () => {
  const key = "locations/test/bomb.png";
  const over = await worker.fetch(req(`/w/160/webp/80/${key}`), makeEnv({ [key]: pngHeader(12000, 12000) }), ctx);
  assert.equal(over.status, 413);
  assert.equal(((await over.json()) as { error: string }).error, "input_dimensions_too_large");
  assert.equal(over.headers.get("Cache-Control"), "no-store");
  // just over / at the limit: 4000x4001 rejected, 4000x4000 passes the guard (then fails as truncated -> 422)
  assert.equal((await worker.fetch(req(`/w/160/webp/80/${key}`), makeEnv({ [key]: pngHeader(4000, 4001) }), ctx)).status, 413);
  assert.equal((await worker.fetch(req(`/w/160/webp/80/${key}`), makeEnv({ [key]: pngHeader(4000, 4000) }), ctx)).status, 422);
  // huge single dimension must not overflow the check
  assert.equal((await worker.fetch(req(`/w/160/webp/80/${key}`), makeEnv({ [key]: pngHeader(0xffffffff, 0xffffffff) }), ctx)).status, 413);
});

test("path traversal, encoded separators and malformed encoding", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED });
  const status = async (p: string) => (await worker.fetch(req(p), env, ctx)).status;
  assert.equal(await status("/w/160/webp/80/locations/%2e%2e/secret.png"), 400);
  assert.equal(await status("/w/160/webp/80/locations/test%5C..%5Cphoto.png"), 400);
  assert.equal(await status("/w/160/webp/80/locations/test/photo.png%00.png"), 400);
  assert.equal(await status("/w/160/webp/80/locations/test//photo.png"), 400);
  assert.equal(await status("/w/160/webp/80/locations/test/%E0%A4%A.png"), 400); // malformed percent-encoding
  assert.equal(await status("/w/160/webp/80/locations/t%C3%A9st/photo.png"), 400); // non-ASCII not in allowlist
  assert.equal(await status("/w/160/webp/80//etc/passwd.png"), 400);
  // %2F decodes to the same object key; resolves to the same R2 object, not an escape
  assert.equal(await status("/w/160/webp/80/locations%2Ftest%2Fphoto.png"), 200);
});

test("non GET/HEAD methods are rejected; HEAD allowed", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED });
  const post = await worker.fetch(new Request(`https://example.test${P}`, { method: "POST", body: "x" }), env, ctx);
  assert.equal(post.status, 405);
  const head = await worker.fetch(new Request(`https://example.test${P}`, { method: "HEAD" }), env, ctx);
  assert.equal(head.status, 200);
});

test("R2 failures return a generic 502 without leaking internals", async () => {
  const env = { IMAGES: { get: async () => { throw new Error("R2 secret-bucket internal boom"); } } } as unknown as { IMAGES: R2Bucket };
  const res = await worker.fetch(req(P), env, ctx);
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!/boom|secret-bucket/.test(text));
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = { IMAGES: { get: async () => ({ size: 10, arrayBuffer: async () => { throw new Error("stream boom"); } }) } } as unknown as { IMAGES: R2Bucket };
  const res2 = await worker.fetch(req(P), body, ctx);
  assert.equal(res2.status, 502);
  assert.ok(!/boom/.test(await res2.text()));
});

test("transform failure body is generic", async () => {
  const res = await worker.fetch(req(P), makeEnv({ "locations/test/photo.png": new Uint8Array(128).fill(7) }), ctx);
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: "transform_failed" });
});

test("access token: wrong, empty, prefix, wrong-scheme and different-length values are all 401", async () => {
  const env = makeEnv({ "locations/test/photo.png": PNG_MED }, "sekret");
  for (const h of [undefined, "", "Bearer ", "Bearer sekre", "Bearer sekretX", "sekret", "bearer sekret", "Basic sekret"]) {
    const res = await worker.fetch(req(P, h === undefined ? {} : { Authorization: h }), env, ctx);
    assert.equal(res.status, 401, String(h));
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
  assert.equal((await worker.fetch(req(P, { Authorization: "Bearer sekret" }), env, ctx)).status, 200);
});

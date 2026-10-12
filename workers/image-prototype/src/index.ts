import {
  ALLOWED_OUTPUT_FORMATS,
  ALLOWED_WIDTHS,
  KEY_PATTERN,
  MAX_INPUT_BYTES,
  MAX_KEY_LENGTH,
  MAX_OUTPUT_BYTES,
  OUTPUT_CONTENT_TYPES,
  QUALITY_MAX,
  QUALITY_MIN,
  VERSION,
} from "./config";
import { cacheKey, getCache } from "./cache";
import { PIXEL_LIMIT_ERROR, transformImage } from "./transform";

interface Env {
  /** Read-only R2 binding to the image bucket. The prototype never writes. */
  IMAGES: R2Bucket;
  /**
   * Optional shared secret. When set (via `wrangler secret put` at deploy
   * time), every request must present `Authorization: Bearer <secret>`.
   * Never hardcoded and never printed.
   */
  ACCESS_TOKEN?: string;
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Constant-time comparison: both sides are hashed to equal-length digests first. */
async function tokenMatches(header: string | null, token: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(header ?? "")),
    crypto.subtle.digest("SHA-256", enc.encode(`Bearer ${token}`)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === "/_health") {
      return json({ ok: true, version: VERSION }, 200);
    }

    // Access control: only active when a secret has been configured.
    if (env.ACCESS_TOKEN) {
      if (!(await tokenMatches(request.headers.get("Authorization"), env.ACCESS_TOKEN))) {
        return json({ error: "unauthorized" }, 401);
      }
    }

    // Route: /w/{width}/{format}/{quality}/{object-key...}
    const m = url.pathname.match(/^\/w\/(\d{1,4})\/(jpeg|webp)\/(\d{1,2})\/(.+)$/i);
    if (!m) {
      return json({ error: "invalid_path", hint: "expected /w/{width}/{format}/{quality}/{key}" }, 400);
    }

    const width = Number(m[1]);
    const format = m[2].toLowerCase();
    const quality = Number(m[3]);

    if (!ALLOWED_WIDTHS.has(width)) {
      return json({ error: "width_not_allowed", width }, 400);
    }
    if (!ALLOWED_OUTPUT_FORMATS.has(format)) {
      return json({ error: "format_not_allowed", format }, 400);
    }
    if (!Number.isInteger(quality) || quality < QUALITY_MIN || quality > QUALITY_MAX) {
      return json({ error: "quality_out_of_range", quality, min: QUALITY_MIN, max: QUALITY_MAX }, 400);
    }

    let objectKey: string;
    try {
      objectKey = decodeURIComponent(m[4]);
    } catch {
      return json({ error: "invalid_key_encoding" }, 400);
    }

    // Object-key validation: length, traversal, and prefix/extension shape.
    if (objectKey.length > MAX_KEY_LENGTH) {
      return json({ error: "key_too_long" }, 400);
    }
    if (objectKey.includes("..") || objectKey.includes("\\") || objectKey.includes("//") || objectKey.startsWith("/")) {
      return json({ error: "invalid_key" }, 400);
    }
    if (!KEY_PATTERN.test(objectKey)) {
      return json({ error: "invalid_key" }, 400);
    }

    // Deterministic cache key; format is already folded in (no Vary).
    const key = cacheKey(width, format, quality, objectKey);
    // Access-controlled deployments never touch the shared cache: no read, no
    // write, and responses are marked private.
    const isPrivate = Boolean(env.ACCESS_TOKEN);
    const cache = isPrivate ? undefined : getCache();

    // A cache read failure is treated as a miss.
    let cached: Response | undefined;
    if (cache) {
      try {
        cached = await cache.match(key);
      } catch {
        cached = undefined;
      }
    }
    if (cached && cached.status === 200) {
      return new Response(cached.body, {
        status: 200,
        headers: new Headers(cached.headers),
      });
    }

    // Read-only R2 access. Missing object -> 404 (uniform, no enumeration).
    let object: R2ObjectBody | null;
    try {
      object = await env.IMAGES.get(objectKey);
    } catch {
      return json({ error: "upstream_unavailable" }, 502);
    }
    if (!object) {
      return json({ error: "not_found" }, 404);
    }

    // Input-size safeguard (mirrors the app's 10 MB upload cap).
    if (object.size > MAX_INPUT_BYTES) {
      return json({ error: "input_too_large", size: object.size, max: MAX_INPUT_BYTES }, 413);
    }

    let input: Uint8Array;
    try {
      input = new Uint8Array(await object.arrayBuffer());
    } catch {
      return json({ error: "upstream_unavailable" }, 502);
    }

    // Real WASM transform. Failures return a controlled error; original bytes
    // are never returned as a successful transformed response.
    let output: Uint8Array;
    try {
      const result = await transformImage(input, width, format as "jpeg" | "webp", quality);
      output = result.data;
    } catch (e) {
      if (e instanceof Error && e.message === PIXEL_LIMIT_ERROR) {
        return json({ error: "input_dimensions_too_large" }, 413);
      }
      return json({ error: "transform_failed" }, 422);
    }

    if (output.byteLength > MAX_OUTPUT_BYTES) {
      return json({ error: "output_too_large" }, 413);
    }

    const response = new Response(output, {
      status: 200,
      headers: {
        "Content-Type": OUTPUT_CONTENT_TYPES[format] ?? "application/octet-stream",
        "Content-Length": String(output.byteLength),
        "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
      },
    });

    // Cache only successful, publicly cacheable responses.
    if (cache) {
      // A cache write failure must not affect the response.
      ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }

    return response;
  },
};

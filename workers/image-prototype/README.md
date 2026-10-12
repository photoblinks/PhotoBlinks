# photoblinks-image-prototype (Phase 4)

Isolated Cloudflare Worker prototype for the image-delivery pipeline. **This is
NOT wired to the application.**

## Status

- ✅ Routing, validation, deterministic cache keys, content types, cache
  headers, error handling, and size safeguards.
- ✅ **Real image transformation** via `wasm-image-optimization@2.0.11`
  (Skia): decode → scale-down → re-encode. JPEG and WebP output; JPEG/PNG/WebP
  source. Aspect ratio preserved; **never upscales** beyond original dims.
- ✅ Verified under the actual `workerd` runtime (`wrangler dev`) using the
  package's `workerd` entry point (pre-compiled `WebAssembly.Module`).
- ❌ Real R2 reads against a live bucket — **not tested** (the Worker has never
  been pointed at a real bucket; see the Phase 6 report addenda for the current
  account/auth status).
- ❌ Actual Cloudflare CPU time and memory — **not measured** (requires remote
  deployment). Local timings are wall-clock, not CPU.
- ❌ Local CPU evidence is unavailable (verified 2026-10-12): local
  `workerd`/Miniflare emits `cpu_time_ms = 0` for every invocation, and
  `limits.cpu_ms` is not enforced locally — see
  `docs/image-pipeline/phase-6-report.md`, addendum 2.

## Layout (isolated from the app)

- `src/index.ts` — request handler (route, validation, cache, R2 read, response).
- `src/config.ts` — width/format/quality allowlists + size/limits.
- `src/dimensions.ts` — JPEG/PNG/WebP dimension sniffing (no-upscale clamp).
- `src/transform.ts` — real WASM transform (decode → resize → encode).
- `src/cache.ts` — deterministic cache key + Cache API accessor.
- `test/index.test.ts` — 33 tests (real WASM transforms, fake env + fake Cache).
- `scripts/make-fixtures.mjs` — generates gradient PNG fixtures and derives
  JPEG/WebP sources via the library.
- `wrangler.jsonc` — binding `IMAGES` → bucket `photoblinks-images-test`
  (a dedicated test bucket name; does not exist yet and must be a separate
  bucket, never the production bucket).

## Run locally (no Cloudflare auth required)

```sh
npm install
npm run typecheck
npm run test
node scripts/make-fixtures.mjs
npx wrangler r2 object put "photoblinks-images-test/locations/test/photo.png" \
    --file fixtures/png-640x480.png --local --persist-to .wrangler/state
npm run dev            # wrangler dev, local mode, http://127.0.0.1:8787
```

Smoke checks:

```sh
curl -i http://127.0.0.1:8787/_health
curl -i http://127.0.0.1:8787/w/160/webp/80/locations/test/photo.png  # 200 image/webp
curl -i http://127.0.0.1:8787/w/160/jpeg/80/locations/test/photo.png  # 200 image/jpeg
curl -i http://127.0.0.1:8787/w/500/webp/80/locations/test/photo.png  # 400
```

## Route contract

```
/w/{width}/{format}/{quality}/{object-key}
  width   ∈ {160, 400, 640, 800, 1200, 1920}
  format  ∈ {jpeg, webp}
  quality ∈ [40..90]
  object-key  must match the prefix/extension allowlist in src/config.ts
```

Errors are JSON with `Cache-Control: no-store`; only `200` responses are cached
(`public, max-age=31536000, immutable`). Transform failures return `422` and
never fall back to serving the original bytes as a transform. When
`ACCESS_TOKEN` is configured as a secret, requests must send
`Authorization: Bearer <secret>`.

## Production-readiness gaps (do not assume)

- No request-count / rate limiting (Phase 5).
- Real (remote) R2 reads, CPU time, and memory not yet verified.
- `wasm-image-optimization` is Skia-based (~6.9 MB WASM); measured local CPU
  cost for the widths the app uses is 60–800 ms per transform, i.e. far beyond
  the Workers **Free** 10 ms CPU limit. The account is on the Free plan
  (confirmed 2026-10-12); no remote measurement exists yet, so the on-Free
  verdict is inferred rather than observed
  (`docs/image-pipeline/phase-6-report.md`, addendum 2).
- Local `wrangler dev` timings are wall-clock, not Cloudflare CPU time.


> **Status (2026-10-12): deferred.** Not deployed, not wired into the app. Production use waits until the Cloudflare plan and real CPU/memory feasibility are reassessed (see `docs/image-pipeline/phase-6-report.md`).

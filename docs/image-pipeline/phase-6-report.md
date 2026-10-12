# Phase 6 — Test, Secure, Benchmark (local only)

Date: 2026-10-12. Scope: `workers/image-prototype/`. Nothing deployed.
Limits source: https://developers.cloudflare.com/workers/platform/limits/ (page "last updated Oct 8, 2026", fetched 2026-10-12).

## Documented limits (not measurements)

| Limit | Free | Paid |
|---|---|---|
| Memory per isolate | 128 MB | 128 MB |
| CPU per HTTP request | 10 ms | default 30 s, max 5 min |
| Cache API object | 512 MB | 512 MB |

## Measured (Node 22.20 on a developer laptop, wall-clock, NOT Cloudflare CPU)

`scripts/bench.mts`, quality 80, 10 samples per cell, JPEG/PNG/WebP sources, widths 160–1920.
Selected medians (output WxH, bytes):

| Source | Output | Median ms |
|---|---|---|
| png 640x480 (211 KB) | webp 160 → 160x120 (954 B) | 41 |
| png 640x480 | webp 640 → 640x480 (3040 B) | 270 |
| jpeg 1920x1080 (42 KB) | webp 160 → 160x90 (936 B) | 80 |
| jpeg 1920x1080 | webp 640 → 640x360 (2858 B) | 328 |
| jpeg 1920x1080 | webp 1920 → 1920x1080 (15914 B) | 1844 |
| jpeg 1920x1080 | jpeg 1920 → 1920x1080 (39707 B) | 199 |
| synthetic flat png 4000x3000 (35 KB) | webp 1920 → 1920x1440 (5460 B) | 2740 |
| synthetic flat png 4000x3000 | jpeg 1920 → 1920x1440 (16958 B) | 499 |

- Cold first call in the Node process: ~7.8 s (WASM compile/init in Node; not representative of workerd).
- No errors in 120 matrix cells. Dimensions, aspect ratio, and no-upscale held in every cell
  (e.g. 640 source at width 1920 → 640x480; 8x6 stays 8x6).
- WebP encoding is ~5–9x slower than JPEG at large widths. Small widths (160) are 40–150 ms.
- Timings are noisy (min/max in the raw run differ up to 2x) and machine-dependent.

**Consequence:** every non-trivial transform exceeds the Free 10 ms CPU limit by orders of
magnitude even allowing for Node-vs-workerd differences. Free plan is not viable. Whether Paid
fits is plausible (default 30 s) but real CPU time is **unmeasured**.

## Local workerd (`wrangler dev`, local R2 + local Cache) smoke tests

All passed: 200 with `image/webp`/`image/jpeg` and `public, max-age=31536000, immutable`;
second identical request 11–16 ms vs 300–550 ms miss; after deleting the source object from
local R2 the cached variant still returned 200 while an uncached width returned 404 (proves a
real cache hit, not recomputation); 404/400/405/413 carry `no-store`; protected mode
(`--var ACCESS_TOKEN`) returned 401 without a token, 200 with `Cache-Control: private, no-store`,
and was not served from the cache populated by the unprotected run. This is local workerd/Miniflare
emulation: it does **not** establish production Cache API behavior, CPU, or memory.

## Security review

Fixed (tests added):
1. **Decompression bomb (confirmed).** A 420 KB PNG declaring 12000x12000 (144 MP) decoded
   successfully in Node with no guard; in a 128 MB isolate this would exhaust memory. Added
   `MAX_INPUT_PIXELS = 16,000,000` (≈64 MB as RGBA); over-limit returns 413
   `input_dimensions_too_large` before decode. **Provisional**: chosen from the 128 MB documented
   limit, not from a memory measurement. Risk: legitimate >16 MP originals (e.g. 48 MP phone JPEGs
   under the 10 MB upload cap) will return 413. Review against real data before rollout.
2. Token compared with `!==` → now SHA-256 digests compared in constant time.
3. R2 `get`/`arrayBuffer` exceptions were unhandled → generic 502 `upstream_unavailable`, no detail leaked.
4. Any HTTP method accepted → only GET/HEAD; else 405.

Verified OK (tests): traversal (`..`, `%2e%2e`, `\`, `//`, NUL), malformed percent-encoding, non-ASCII keys
(rejected by ASCII allowlist), `%2F` (decodes to the same key; no escape), disallowed width/format/quality,
corrupt bytes (422, generic body), oversize input (413), warm-cache auth bypass (impossible: auth runs before
cache and protected mode skips cache), cache read/write failure, error responses never cached.

Unfixed / not tested:
- No rate limiting in the Worker (belongs in a Cloudflare rule; zone config out of scope).
- Concurrent identical misses each transform (no coalescing).
- Pixel guard relies on header dimensions; a header understating real size would bypass it (decoder behavior on
  lying headers untested).
- `/_health` is unauthenticated (returns only the cache version).
- CORS: none added. Intended use is `<img>`/Next image loader, which needs no CORS; revisit if canvas/fetch use appears.
- Real R2 (non-local) errors/latency, production Cache API: not tested.

## Memory

Documented: 128 MB per isolate. Measured peak memory in workerd: **unknown** (local tooling exposes none).
Node process memory was deliberately not used as a proxy.

## Getting a real CPU/memory number

Needs an isolated, non-production Worker deployed to a Cloudflare account (separate test R2 bucket
`photoblinks-images-test`, `workers.dev` only), a Paid plan to test the 30 s class, then reading CPU time from
the Worker's observability/trace data while sending the benchmark matrix. Risks: account/billing exposure,
test bucket contents. Cleanup: delete the Worker and the test bucket. **Not done — requires explicit authorization**
of target account and plan. `wrangler whoami` was previously unauthenticated.

## Verdict

Partially complete. Local security hardening and local-runtime smoke done; real CPU and memory unknown; the
16 MP cap is provisional. Not production-ready.

---

# Addendum (2026-10-12): Cloudflare CPU measurement plan — investigation only, nothing created or deployed

## Account (read-only checks)
- `wrangler whoami`: authenticated via OAuth (earlier README note "not authenticated" is stale). One account. Token scopes include `workers_scripts (write)`, `workers_tail (read)`, `account (read)`; no R2-specific scope listed. Account ID/credentials not recorded here.
- `wrangler r2 bucket list` (read-only): one bucket exists, `photoblinksbucket` (production). `photoblinks-images-test` (the name in `wrangler.jsonc`) does not exist.
- **Plan (Free vs Paid): UNKNOWN.** Wrangler exposes no plan field; no dashboard/API check was made.

## What the docs establish (fetched 2026-10-12)
- Limits (https://developers.cloudflare.com/workers/platform/limits/, updated Oct 8, 2026): Free CPU 10 ms/request, not configurable; Paid default 30 s, max 5 min via `limits.cpu_ms`. Memory 128 MB **per isolate** (shared by concurrent requests). Exceeding either: terminated, error 1102; outcomes `exceededCpu` / `exceededMemory`.
- CPU metric: the page states "Workers Logs, Tail Workers, and Logpush include CPU and wall time per invocation". The Workers metrics dashboard also has a "CPU Time per execution" chart (quantiles unnamed; Free availability unstated). https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- NOT confirmed by the pages I fetched: exact field names (`cpuTimeMs`?) in Workers Logs; whether `wrangler tail` JSON includes CPU time (the documented example does not). Confirm on first real run.
- Workers Logs: included in Free (200k events/day, 3-day retention) and Paid (https://developers.cloudflare.com/workers/observability/logs/workers-logs/). Tail Workers: Paid/Enterprise only.
- Pricing (https://developers.cloudflare.com/workers/platform/pricing/): Paid $5/month minimum, 30M CPU-ms/month included, $0.02 per extra million CPU-ms. Free has no overage; limits fail requests. R2 pricing not fetched — unverified.
- Memory: no production API for per-request peak memory is documented. Only `exceededMemory` counts, and a metrics-dashboard "Memory usage" chart (P50/P90/P99/P999) mentioned on the metrics page. Peak memory stays **unknown** until a deployed run; local DevTools profiling is the only documented per-request tool and it is local.

## Smallest valid measurement
Needs a deployed, isolated, non-production Worker — local `workerd` does not enforce or report Cloudflare CPU. Required (all remote, none done):
1. Worker `photoblinks-image-prototype` on `workers.dev` only (no routes, no DNS). Needs `observability.enabled: true` in `wrangler.jsonc` (currently `false`) to get Workers Logs with CPU time.
2. Source images: `wrangler.jsonc` binds R2 `IMAGES`. Options: (a) create R2 bucket `photoblinks-images-test` and upload synthetic fixtures only (R2 may need payment details/charges: unverified); (b) a temporary test-only entry that bundles fixtures — avoids R2 but measures a slightly different path (not the existing handler), so (a) is preferred. Never bind `photoblinksbucket`.
3. Set `ACCESS_TOKEN` secret so the endpoint is not public; send it from the test client.
4. Plan: Free plan can only show pass/fail against 10 ms (each transform will almost certainly return 1102). A meaningful CPU number for transforms >10 ms requires Paid ($5/month minimum; **needs your explicit approval**).

### Cases (synthetic fixtures only; 10 samples each, 1 request/s, sequential; `q=80`)
| # | Input | Request | Metric |
|---|---|---|---|
| 1 | jpeg 640x480 (9.9 KB) | `/w/160/webp/80` | CPU ms |
| 2 | jpeg 1920x1080 (41.6 KB) | `/w/640/webp/80` | CPU ms |
| 3 | png 640x480 (211 KB) | `/w/640/webp/80` | CPU ms |
| 4 | jpeg 1920x1080 | `/w/1920/jpeg/80` | CPU ms |
| 5 | png 1920x1080 (225 KB) | `/w/1920/webp/80` | CPU ms |
| 6 | repeat of #2 (cache hit) | same | CPU ms (hit vs miss) |
Distinct object keys per sample (or distinct widths) so each sample is a cache miss; the first request after deploy is the cold-start sample, recorded separately. Capture per invocation: Cloudflare CPU time, wall time, outcome, status. Client-side end-to-end time is recorded but never used as CPU. Local Node/workerd wall-clock figures in this report are not comparable to these.

The synthetic fixtures are mostly gradients/flat colour and may under-represent real photographs' encode cost; a CPU number from them is a lower-bound indication. Real photographs are not to be uploaded without a separate decision.

## Feasibility criteria (proposed, to be agreed before any run)
- Target limit: Paid default 30 s CPU (Free 10 ms disqualifies every case).
- PASS: all six cases succeed with outcome `ok` on ≥10/10 samples; worst-case sample (not median) ≤ 50% of the applicable limit (≤15 s on Paid), and cache hit CPU ≪ miss; no `exceededMemory`.
- Product-level bar (my suggestion, needs your input): a 30 s ceiling is not a latency target. Decide an acceptable per-miss latency/cost (e.g. well under a few seconds for the widths pages actually use) before reading results; CPU time is also billed above 30M ms/month.
- FAIL: any `exceededCpu`, `exceededMemory`, 1102, or sample > 50% of limit.
- INCONCLUSIVE: CPU field unavailable in logs/metrics, <10 samples, plan unconfirmed, or results dominated by cold start.
- Passing CPU does not establish memory, latency or throughput. Memory is judged only via absence of `exceededMemory` plus the dashboard memory chart (isolate-level, shared across concurrent requests); this bounds, but does not measure, per-transform peak.

## 16 MP guard
Protects the 128 MB isolate (16 MP ≈ 64 MB RGBA; decoder/encoder heap on top is unmeasured, so even 16 MP may be too high or too low). Rejecting >16 MP also rejects legitimate originals: 12 MP phone photos pass, 48/50 MP phone and 24–61 MP camera files do not, and the 10 MB upload cap does not prevent them. Evidence needed before choosing a production limit: (1) the pixel-size distribution of real stored originals (read-only query of metadata/headers — not done); (2) deployed runs at several pixel counts (e.g. 4, 8, 12, 16, 24 MP, with realistic content) watching for `exceededMemory`; (3) a decision on the alternative for oversize originals (serve existing pre-sized variants/originals vs 413). The cap was not changed in this run.

## Status
Phase 6 remains partially complete. Blocker: a remote isolated deployment (and likely a Paid plan and an R2 test bucket) is required for genuine CPU/memory numbers. Requested approvals: (a) deploy `photoblinks-image-prototype` to `workers.dev` with observability enabled, (b) create R2 bucket `photoblinks-images-test` with synthetic fixtures only, (c) confirm/approve Paid plan ($5/month minimum, billed) or confirm the account is already Paid, (d) cleanup afterwards: delete the Worker, delete the bucket, remove the secret. Nothing was created, deployed, upgraded, changed or committed in this run.

---

# Addendum 2 (2026-10-12, later run): Free-plan feasibility assessment — local investigation only, nothing deployed or created

Confirmed input for this run: the account is on the **Workers Free plan** (stated by the user; not re-checked against the API, since no plan field is exposed by Wrangler). All work stayed inside `workers/image-prototype/` plus temporary files in `%TEMP%`; both temporary in-repo probe files were deleted at the end.

## 1. Verified Free-plan constraints (official sources, fetched 2026-10-12)

| Constraint | Free | Paid | Source |
|---|---|---|---|
| CPU time per HTTP request | **10 ms** | 5 min (default 30 s) | [limits](https://developers.cloudflare.com/workers/platform/limits/) — page states "Last updated Oct 8, 2026" |
| Memory per isolate | 128 MB | 128 MB | same |
| Worker startup time | 1 s | 1 s | same |

- CPU time = "how long the CPU spends executing your Worker code"; waiting on network/KV/DB does **not** count.
- Only the Paid section documents raising the limit (`limits.cpu_ms`), so **10 ms is not adjustable on Free**.
- Exceeding CPU or memory ⇒ client sees **Error 1102** ("Worker exceeded resource limits"); analytics/Logpush outcome `exceededCpu` / `exceededMemory`.
- Where CPU time is observable: **Workers Logs** invocation log; **Tail Workers/Logpush** trace events; **local DevTools CPU profiles**.
  - Workers Logs is included in Free (200,000 events/day, 3-day retention): [workers-logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) (fetched 2026-10-12).
  - Tail Workers: "available to all customers on the Workers **Paid and Enterprise** tiers" — [tail-workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) (page updated Oct 2, 2026). So Tail Workers are **not** a Free-plan option.
  - New page [profiling-in-production](https://developers.cloudflare.com/workers/observability/profiling-in-production/) (updated Oct 10, 2026): CPU/heap profiles of a **deployed** Worker via dashboard/`cf` CLI/API. Plan availability is not stated on that page (unverified); it requires a deployment.
- [local-development](https://developers.cloudflare.com/workers/local-development/) (fetched 2026-10-12) makes **no statement** that local dev enforces or reports Workers limits.
- No page fetched today documents a way to read Cloudflare CPU time without a deployed Worker.

## 2. What the existing benchmark evidence establishes — and what it does not

**Establishes (local, Node 22.20, `scripts/bench.mts`, wall-clock):** the transform works for every source/width/format cell (120 cells, no errors); dimensions, aspect ratio and the no-upscale rule hold; JPEG output is ~9× cheaper than WebP at large widths (1920: 199 ms vs 1844 ms median); warm-cache hits are 11–16 ms vs 300–550 ms cold in local `wrangler dev`.

**Does not establish:** Cloudflare CPU time (wall ≠ CPU), per-request peak memory, or startup time. Local `workerd` wall-clock and Node wall-clock are not Cloudflare CPU and are not converted here.

**Cost attribution added in this run** (`speed` A/B, interleaved, 8 rounds, medians of Node process CPU time — user+system — not Cloudflare CPU):

| Operation (quality 80) | Node CPU median | Output |
|---|---|---|
| png 640×480 → raw, width 640 (decode + resize only) | 16 ms | 1,228,800 B |
| jpeg 1920×1080 → raw, width 1920 (decode + resize only) | 63 ms | 8,294,400 B |
| jpeg 1920×1080 → **webp**, width 640 | 141 ms | 2,858 B |
| jpeg 1920×1080 → **webp**, width 1920 | 797–828 ms | 15,914 B |
| jpeg 1920×1080 → **jpeg**, width 1920 | 79 ms | 39,707 B |
| png 640×480 → webp, width 640 | 109–125 ms | 3,040 B |

- **`speed` is not a materially cheaper path for the formats the Worker serves.** For webp (640 and 1920) and jpeg (1920), `speed` 0 / 3 / 6 / 10 and the default (6) produced **byte-identical output (identical SHA-256)** with statistically indistinguishable CPU time. This matches the library README, which documents `speed` as "primarily used for AVIF" (`wasm-image-optimization@2.0.11`, `dist/core.js` default `speed = 6`).
- **Encoding dominates.** WebP encode costs ~13× the decode+resize stage of the same image and ~10× the JPEG encode of the same image. The only supported materially cheaper output already inside the route contract is `format=jpeg`; the library's other formats (png/avif/raw/thumbhash) are outside the allowlist or are not deliverable images.
- No library replacement, new service, or code change was made, per scope.

## 3. Smallest valid verification method — assessed, not executed remotely

Two independent local checks show that the local stack cannot answer the CPU question:

1. **Local `workerd` reports no CPU time.** The local observability trace store (`workers/image-prototype/.wrangler/state/v3/observability/miniflare-wobs-trace-store`, written by the Phase 6 dev runs) holds 87 spans; all 41 root invocation spans carry `cpu_time_ms = 0` **and** `wall_time_ms = 0`, including invocations whose span duration was 325 ms and 2,060 ms. Miniflare copies these straight from the runtime tail event (`miniflare/dist/src/workers/observability/collector.worker.js:214`, `cpu_time_ms: event.event.cpuTime`), so the zeros mean *not populated locally* — the `wall_time_ms = 0` proves it, because wall time was demonstrably not zero. (An earlier report line said local tooling "exposes none"; this run shows the field exists locally and is emitted as 0.)
2. **Local dev does not enforce the Free CPU limit.** `wrangler dev` (local mode, port 8791, existing local R2 state) was run with a temporary config identical to `wrangler.jsonc` except `"limits": { "cpu_ms": 10 }` (file deleted afterwards). Result: `GET /_health` → 200; `GET /w/640/webp/80/locations/test/photo.png` → **200, 3,040 bytes, 303 ms wall**. Wrangler maps `limits` only into the deploy payload (`convertTopLevel` in `wrangler-dist/cli.js`) and Miniflare contains no CPU-limit enforcement, consistent with what was observed.

**Consequence on Free.** A per-request CPU figure for these transforms cannot be obtained: Cloudflare CPU accounting exists only for a deployed Worker (remote), and once a transform exceeds 10 ms the invocation is terminated with 1102 instead of completing, so the plan yields a pass/fail signal for the *smallest* cases rather than a usable cost figure for a 640/1200/1920 px transform. Terminated invocations are still expected to appear in Workers Logs (Free-eligible) with a CPU value near the limit, but what that value reports for a killed invocation is **unverified** and was not tested — no failing requests were sent anywhere, and only two local requests were made for check 2 above.

## 4. Option evaluation (nothing implemented)

| Option | Evidence for | Evidence against | Status |
|---|---|---|---|
| Retain the current WASM Worker on Free | Runs correctly; correct dimensions/format; local CPU cost is only inferred for the Free limit, never measured | The cheapest operation measured (png 640×480 decode+resize, no encode) used 16 ms Node CPU and everything the app actually serves used 60–800 ms — 6×–80× the 10 ms limit; no supported cheaper WebP path; Free cannot prove the opposite because over-limit requests cannot complete | **Not supported by evidence** |
| Keep the existing transformation service as fallback where still available | It is what the app uses today (`/cdn-cgi/image/` via `src/lib/cf-image-loader.ts`); rollback is an env flag; no code change needed | Its Free unique-transformation quota is already exhausted on the account (HTTP 429 `ERROR 9422`), which is the reason this phase exists; fixed-width reduction (640/1200) mitigates but does not remove the quota | **Existing, unproven as a durable fallback** |
| Defer remote validation until an authorized test environment with a suitable CPU limit exists | It is the only path to real CPU/memory/startup numbers | Requires an authorized deployment, resource creation and cleanup; a numeric CPU figure needs a plan whose limit does not kill the request | **The only evidence-producing option** |

No option is claimed to solve the problem; none was implemented.

## 5. Classification

**Nonviable on Free — high confidence, inferred, not Cloudflare-measured.** Supporting evidence: documented 10 ms Free limit (official, Oct 8 2026); every locally measured transform cost 16–828 ms of Node CPU, i.e. 1.6×–80× the limit, with the widths the site actually uses (400/640/1200/1920) at the high end; the cheapest possible stage (decode+resize, no encode) already exceeds 10 ms; and the library offers no supported option that reduces WebP encode cost. Residual uncertainty: local CPU ≠ Cloudflare CPU (different hardware and V8 build), and the production CPU number itself remains unmeasured — but no plausible platform factor closes a 6×–80× gap for the widths that matter. Memory and startup (1 s, both plans) remain unmeasured; startup is expected to be dominated by the pre-compiled 6.9 MB WASM module import.

## 6. Smallest remaining Phase 6 action

1. **To close the Free question (cheapest, needs authorization, no billing):** one isolated deploy of the existing prototype (`workers.dev`, `observability.enabled: true`, `ACCESS_TOKEN` secret, synthetic fixtures in a temporary R2 bucket), **one** request per case, read the invocation log's CPU/outcome, then delete Worker + bucket + secret. Expected outcome: `exceededCpu`/1102 — pass/fail only, no usable number.
2. **To obtain a real numeric CPU figure (needs explicit approval + spend):** the same deploy on a plan whose CPU limit lets the transform complete (Paid default 30 s), because that is the only documented way to get `cpu_time_ms` for widths ≥ 400.

## 7. Security, tests and change containment (this run)

- `npm test`: **33/33 pass**; `npm run typecheck`: **clean**. The 16 MP guard (`MAX_INPUT_PIXELS` untouched), token auth, cache isolation and error handling are unchanged.
- Temporary files created and deleted: `wrangler.cpu10.tmp.jsonc`, `scripts/tmp-speed-probe.mts` (both inside `workers/image-prototype/`). Probe scripts and log copies lived in `%TEMP%`. `git status` is byte-for-byte the same set of modified/untracked entries as at the start of this run; nothing was committed.
- Local-only side effect: the gitignored `.wrangler/state` gained trace rows and cached variants from the local `wrangler dev` run.
- No deployment, plan change, billing change, DNS/route change, R2 object or permission change, Supabase change, environment-variable change or production-application change was made. Wrangler was only used in local mode; no `wrangler deploy`, `r2` write, or remote API call was issued.

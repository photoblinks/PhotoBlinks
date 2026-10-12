# PhotoBlinks Image Delivery — Migration Checklist & Inventory

> **Plan phase:** 2 of 7 (documentation only). Ordered checklist for Phases
> 3–7 of the Worker + WASM cutover. Companion: [`architecture.md`](./architecture.md).
>
> Naming note: an earlier, unrelated workstream ("Phase 2 image-transformation
> optimization") produced the fixed-width changes now sitting **uncommitted** in
> the working tree. That is *not* this document's "Phase 2". Those changes are
> a prerequisite input to this plan (see §1) and must be preserved/committed as
> their own change.

## Progress ledger

| Plan phase | Description | Status |
|---|---|---|
| 1 | Read-only audit + architecture options | ✅ done (prior turn) |
| 2 | Target architecture + migration checklist (this doc set) | ✅ done — this artifact |
| 3 | WASM benchmark spike | ⬜ next |
| 4 | Convert implicit-loader surfaces to fixed widths | ⬜ |
| 5 | Build + deploy Worker on a dedicated host | ⬜ |
| 6 | Cutover behind env flag (A/B) | ⬜ |
| 7 | Decommission Image Transformations + cleanup | ⬜ |

---

## 1. Migration inventory

### 1.1 Producer functions (the only code that emits transform URLs)

| Function | File | Width | Change needed |
|---|---|---|---|
| `toTransformUrl` | `src/lib/cf-image-loader.ts:48` | per-call | rewrite URL scheme behind env flag |
| `adminPreviewUrl` | `src/lib/cf-image-loader.ts:75` | 400 | none (calls `toTransformUrl`) |
| `cfImageLoader` | `src/lib/cf-image-loader.ts:79` | Next `loaderFile` | none (calls `toTransformUrl`) |
| `socialImageUrl` | `src/lib/jsonld.ts:16` | 1200 | none (calls `toTransformUrl`) |

### 1.2 Group A — implicit Next.js loader (`srcset`, multi-width)

These currently rely on the custom loader producing Next's default
`deviceSizes` and therefore **many transform variants**. Each must be given a
fixed width + `unoptimized` (the pattern already used in Group B). **No widths
are assigned yet — that is a Phase 4 decision.**

| # | Site | Surface |
|---|---|---|
| 1 | `src/components/public/hero-banner-slider.tsx:60` | homepage hero (LCP, `priority` slide 0) |
| 2 | `src/components/public/studio-card.tsx:11` | studio cards |
| 3 | `src/components/public/blog-post-card.tsx:17` | blog cards (**no `sizes` → `100vw`**) |
| 4 | `src/components/public/blog-content-renderer.tsx:109` | blog body image |
| 5 | `src/components/public/blog-content-renderer.tsx:174` | blog gallery |
| 6 | `src/components/public/sponsored-photographer-card.tsx:62` | sponsored card (**no `sizes`**) |
| 7 | `src/components/public/about-section.tsx:24` | about page |
| 8 | `src/app/(public)/c/[token]/page.tsx:52` | shared-collection avatar (`sizes="80px"`) |
| 9 | `src/app/(public)/category/[slug]/page.tsx:93` | category hero (`priority`) |
| 10 | `src/app/(public)/blog/[slug]/page.tsx:128` | blog featured (`priority`) |
| 11 | `src/app/(public)/locations/[country]/page.tsx:105` | country hero (`priority`) |
| 12 | `src/app/(public)/locations/[country]/[state]/page.tsx:98` | state hero (`priority`) |
| 13 | `src/app/(public)/locations/[country]/[state]/[city]/page.tsx:152` | city hero (`priority`) |
| 14 | `src/app/admin/(shell)/photographer-photos/page.tsx:139` | admin moderation thumb (`sizes="80px"`, raw `row.image_url`) |

### 1.3 Group B — explicit fixed width + `unoptimized` (already done)

These need **no code change**; only the `toTransformUrl` output scheme changes.

| Site | Width |
|---|---|
| `src/components/public/image-gallery.tsx` (6 `<Image>` sites) | 1200 / 640 / 1920 |
| `src/components/public/location-card.tsx:40` | 640 |
| `src/components/public/photographer-photo-section.tsx:29` | 800 |
| `src/app/photographer/(shell)/page.tsx:257` | 160 |
| `src/components/public/location-popup-card.tsx:15` | 160 (pre-transformed in `src/lib/public-data.ts:403`) |

### 1.4 Group C — admin previews (`adminPreviewUrl`, width 400)

No code change; output scheme flips automatically.

`src/components/admin/image-uploader.tsx:60` ·
`src/components/admin/gallery-uploader.tsx:84` ·
`src/components/admin/blog-editor/block-fields.tsx:338,404` ·
`src/app/admin/(shell)/studios/page.tsx:129` ·
`src/app/admin/(shell)/locations/page.tsx:202` ·
`src/app/admin/(shell)/photographers/page.tsx:82` ·
`src/app/admin/(shell)/categories/page.tsx:52` ·
`src/app/photographer/(shell)/submit-photo/submit-photo-form.tsx:158`

### 1.5 Group D — social metadata (`socialImageUrl`, width 1200)

`src/lib/jsonld.ts:208,296,363` — consumed by location, studio, blog,
country, state, city, and category pages' `openGraph.images` / JSON-LD.

### 1.6 Group E — not part of this pipeline (leave untouched)

`src/app/opengraph-image.tsx` — `next/og` `ImageResponse` default card;
`DEFAULT_OG_IMAGE` in `src/lib/jsonld.ts:26`.

### 1.7 Incidental (pre-existing, not caused by this plan)

- `src/app/admin/(shell)/locations/locations-list.tsx:201` renders a **raw**
  r2.dev URL with `unoptimized` (would 401). It is **dead code** — no importer
  exists (`grep "locations-list"` → 0). Candidate for deletion, not migration.
- No `Content-Security-Policy` / `img-src` exists anywhere in `src` — no
  security-header change is required for the cutover.

---

## 2. Ordered checklist — Phases 3–7

### Phase 3 — WASM benchmark spike

Goal: settle the two unknowns that gate the architecture (CPU budget and the
128 MB ceiling) and pick a library.

- [ ] Stand up a local `wrangler dev` Worker (outside the app build) with a
      **read-only** R2 binding to the existing bucket.
- [ ] Load `wasm-image-optimization`; fall back to `@cf-wasm/photon`.
- [ ] For each allowlisted width (160, 400, 640, 800, 1200, 1920) and for the
      smallest + largest real originals: record CPU ms and peak memory.
- [ ] Confirm output formats (JPEG/PNG/WebP at minimum; AVIF if available).
- [ ] Confirm `/cdn-cgi/` reservation behaviour (ASSUMPTION from architecture §4).

**Completion criteria:**
- [ ] Measured CPU per width ≤ a documented headroom under the chosen tier's limit.
- [ ] Peak memory ≤ 128 MB for the largest allowed input.
- [ ] Library choice written back into `architecture.md` §6 with measured numbers.
- [ ] AVIF support resolved yes/no.

### Phase 4 — Convert Group A surfaces to fixed widths

Goal: remove the last multi-width `srcset` producers so the Worker only ever
sees allowlisted widths.

- [ ] Assign a fixed width to each Group A site (§1.2), reusing the shared
      constants in `src/lib/cf-image-loader.ts`.
- [ ] Convert each site to `toTransformUrl(src, WIDTH)` + `unoptimized`,
      preserving `alt`, `priority`, `sizes` (as documentation), and layout.
- [ ] Add the new widths to the Worker allowlist table in `architecture.md` §3.

**Completion criteria:**
- [ ] `grep "sizes="` over rendered public pages shows no `srcset`-driven
      `sizes` remaining on `<img>` (favicon link only).
- [ ] Production build + `tsc --noEmit` + `eslint` clean.
- [ ] Distinct widths per rendered page match the intended fixed set.

### Phase 5 — Build and deploy the Worker

Goal: a validation-hardened Worker serving transformed images from R2.

- [ ] Implement: key/width/format/quality validation, `caches.default`,
      scale-down resize, fallback-to-original on failure, `400/404` semantics.
- [ ] Serve under a dedicated host (proposal `img.photoblinks.com`; confirm the
      hostname is provisioned before this is anything but a placeholder).
- [ ] Deploy with a **read-only** R2 binding; bucket remains private.
- [ ] Verify byte/quality parity vs. Cloudflare Image Transformations on a
      sample of real JPEG/PNG/WebP keys.

**Completion criteria:**
- [ ] Invalid width/format/key → `400`; missing key → `404`; oversized input
      handled without Error 1102.
- [ ] `200` responses cached (`Cache-Control: immutable`); error responses never cached.
- [ ] Parity samples approved by a human reviewer.

### Phase 6 — Cutover behind env flag

Goal: switch URL production in the app, reversible at any moment.

- [ ] Add env flag (name TBD, `architecture.md` §3) to `toTransformUrl`.
- [ ] Deploy app with `NEXT_PUBLIC_IMAGE_PIPELINE=worker`.
- [ ] A/B on a subset; monitor Workers error 1102, cache-hit ratio, and image
      load failures.
- [ ] Keep Image Transformations enabled on the zone throughout.

**Completion criteria:**
- [ ] All four producer functions emit the Worker scheme.
- [ ] No `/cdn-cgi/image/` requests from the app.
- [ ] Zero regression on spot-checked public pages (location/studio/home/blog).

### Phase 7 — Decommission + cleanup

Goal: remove the old path and the leftover preview exposure.

- [ ] After a stable window, disable Cloudflare Image Transformations on the zone.
- [ ] Remove the preview deployment
      `photo-blinks-1ty823gv4-photo-blinks.vercel.app` (SSO-protected but runs
      production Supabase + service-role key — see §3).
- [ ] Re-scope `SUPABASE_SERVICE_ROLE_KEY` / point Preview at a non-production
      Supabase project (or accept the documented risk with sign-off).
- [ ] Delete dead `locations-list.tsx` if still unreferenced.

**Completion criteria:**
- [ ] Rollback drill passes: flag flip restores `/cdn-cgi/image/` (only valid
      while Image Transformations is still enabled — do this **before** disabling).
- [ ] Preview deployment removed or Preview env isolated; risk acknowledged in
      the repo (or closed).

---

## 3. Preview deployment exposure (re-verified this turn)

`photo-blinks-1ty823gv4-photo-blinks.vercel.app` — `target=preview`, `Ready`,
SSO-protected (`302 → vercel.com/sso-api`, `X-Robots-Tag: noindex`).
Anonymous access is blocked; the shared browser tab renders only because the
user's Vercel session is authenticated.

- **Exposure risk: LOW externally, MEDIUM blast radius.** It serves production
  Supabase data with `SUPABASE_SERVICE_ROLE_KEY` present in the Preview
  environment (one shared value across Development/Preview/Production).
- **Safest cleanup (needs authorization — not performed):** `vercel remove
  photo-blinks-1ty823gv4-photo-blinks.vercel.app --yes`, then either scope the
  service-role key to Production only or point Preview at a separate Supabase
  project, and rotate the key if it has ever left Vercel.

---

## 4. Facts vs. assumptions (condensed)

- **VERIFIED (repo):** raw R2 URLs in DB; single `/cdn-cgi/image/` producer;
  full surface inventory; fixed-width changes uncommitted; no CSP; dead
  `locations-list.tsx`; `ALLOWED_IMAGE_CONTENT_TYPES` = jpeg/png/webp;
  `MAX_UPLOAD_BYTES` = 10 MB.
- **VERIFIED (observed):** `HTTP 429` / `ERROR 9422` quota exhaustion; new
  (object,width) pairs fail, generated ones serve; production currently
  requests 10 distinct widths per gallery image.
- **VERIFIED (Cloudflare docs):** Workers limits (10 ms Free CPU / 128 MB /
  64 MiB / 100 k req/day; Paid 5 min CPU); WASM = pre-compiled modules, SIMD
  yes, threading no, WASI experimental; R2 `r2.dev` rate-limited, custom domain
  recommended.
- **VERIFIED (npm registry):** `wasm-image-optimization` and `@cf-wasm/photon`
  exist with the cited licenses/descriptions. **No library is approved.**
- **UNVERIFIED:** `@jsquash/*` (registry 403); per-image CPU/memory; AVIF;
  WASM bundle sizes; cache-hit ratio.
- **ASSUMPTION:** `/cdn-cgi/*` cannot be intercepted by the Worker.
- **UNRESOLVED:** worker hostname, route pattern, plan tier, library choice,
  Group A widths, env-flag name, `TRANSFORM_VERSION`, rate-limit values.

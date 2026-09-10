# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# PhotoBlinks — Claude Code Project Rules

PhotoBlinks is a pre-wedding photoshoot location discovery platform.
Launch focus: Karnataka and Kerala, expanding to India.

These rules define project scope, architecture, security, engineering decisions, and efficient agent behavior.

## 0. Commands & Environment

- Local development uses the local Supabase stack (Postgres/Auth/Storage in Docker), never the hosted project. Docker Desktop must be running first.
- `npm run dev` — start Next.js development server (`http://localhost:3000`).
- `npm run build` / `npm run start` — production build / serve.
- `npm run lint` — ESLint (`eslint.config.mjs`).
- `npm run db:start` — start local Supabase stack and apply `supabase/migrations/`.
- `npm run db:stop` — stop the local stack.
- `npm run db:reset` — rebuild local DB from migrations; local only. Never run it against production or use it unprompted for test cleanup.
- No test runner is configured in this repo.
- Hosted migration command: `node --env-file=.env.production-backup scripts/run-migration.mjs supabase/migrations/<file>.sql`. Treat `.env.production-backup` as sensitive and this command as a real-data operation.

## 1. Scope — Do Not Invent Features

- Build only what the user explicitly requests.
- Do not expand scope, redesign architecture, or add "nice-to-have" features without approval.
- No booking, payments, messaging, equipment/costume rentals, AI recommendations, or marketplace functionality unless explicitly requested.
- Locations and studios are separate concepts.

### Locations
- Natural/pre-wedding shoot locations.
- Categories are DB-driven: Beach, Temple, Waterfall, Hill, Mountain, etc.
- Pricing state: Free, Paid, or Unknown, with numeric price where applicable.
- Browse: State → City → Category.

### Studios
- Preset/studio venues.
- No location category.
- Multiple pricing options: label + price.
- Browse: State → City.

Never hardcode locations, categories, pricing concepts, or stable slugs.

## 2. Architecture

- Frontend: Next.js on Vercel.
- Database/Auth: Supabase PostgreSQL + Supabase Auth.
- Image storage: Cloudflare R2 only.
- Maps: Mapbox.
- YouTube: embeds/links only; no YouTube API.
- Google Maps: use existing deep-link patterns.
- One database; do not introduce another backend/database without approval.
- R2 stores image binaries; Supabase stores URLs and metadata only. Never use Supabase Storage for project images.
- Public pages are SEO-first: SSR where appropriate, clean destination-first URLs, dynamic metadata/OG data, sitemap support, and existing canonical URL patterns.

### Route groups (`src/app`)
- `(public)/` — public site: home, location/studio pages, location/studio country pages, category pages, favourites, sign-in/sign-up.
- `admin/(shell)/` — admin panel, including locations, studios, categories, country/state/city pages, SEO tooling, photographer-photo moderation, location-report moderation, and settings. `admin/login` is outside the shell.
- `photographer/(shell)/` — photographer dashboard and submissions. `photographer/signup` is outside the shell.
- `api/admin/` and `api/photographer/` — R2 presigned-upload and orphan-sweep handlers; not general-purpose APIs.
- `auth/callback` and `auth/confirm` — Supabase Auth callback handlers.

### Auth & Session
- `src/proxy.ts` refreshes the Supabase session cookie and performs basic session gating. It checks whether a user exists; role checks happen server-side.
- `src/lib/supabase/client.ts` — browser/anon RLS client.
- `src/lib/supabase/server.ts` — Server Components/Actions, cookie-scoped RLS client.
- `src/lib/supabase/admin.ts` — service-role client; server-only and restricted to approved bootstrap tasks.
- `src/lib/supabase/require-admin.ts` and `require-photographer.ts` are the server-side role gates used by route handlers and Server Actions.

### Data Flow
- Admin writes use colocated Server Actions that validate input, enforce the required role, and write through the server client so RLS still applies.
- Public reads use the existing public-data/Supabase helpers and surface only published/approved rows.
- Photographer photo submissions and location reports are moderation-queued as `pending`; they remain invisible publicly until admin approval.
- Admin moderation queues use Supabase Realtime where live updates are useful.
- Image upload: client requests a server-authorized R2 presigned URL, uploads directly to R2, then stores the resulting URL/metadata in Supabase.
- Rejected/orphaned media is cleaned through the existing R2 orphan-sweep flow.
- `supabase/migrations/` is the source of truth for schema/RLS. Inspect it before assuming table, column, constraint, function, or policy shape.

## 3. Security & Authorization

- Never trust client-side roles, ownership, permissions, or IDs.
- Enforce authentication and authorization server-side.
- Admin access requires a valid Supabase session and existing `is_admin()` authorization.
- `src/lib/supabase/admin.ts` is server-only. Never expose service-role credentials.
- Public queries must expose only published/approved data.
- Preserve and verify RLS.
- Validate important input server-side.
- Protect against XSS, CSRF, SQL injection, SSRF, unsafe URLs, unauthorized ownership access, abusive uploads, excessive request rates, and insecure file access.
- R2 uploads/deletions must be authorized server-side.
- When media is rejected, safely remove the R2 object while retaining required DB records for audit/history.

## 4. Photographer & Report Workflows

- Photographer roles remain separate from normal users and admins.
- Photographers manage only their own profile and submissions.
- A submission targets one existing location or studio and begins as `pending`.
- Pending submissions are never publicly visible.
- Only authorized admins approve/reject submissions and reports.
- Approved photographer media appears on the relevant place page and may expose existing Call/WhatsApp actions.
- Public location reports enter the admin workflow.
- Use Realtime only where live status has clear value, such as moderation queues.
- Do not create duplicate photographer, report, media, approval, or moderation concepts when an existing implementation already handles them.

## 5. Engineering Decision Ladder

Before creating new code, prefer:

1. Existing implementation
2. Existing component/helper/API/table/function
3. Next.js/platform capability
4. Standard library capability
5. Existing dependency
6. Simplify or extend existing code
7. Minimum new implementation

Do not create a new abstraction, dependency, table, API, component, or utility until you have checked whether an existing one can be reused.

Avoid duplicate logic/APIs, unnecessary wrappers/dependencies, speculative abstractions, unrelated refactors, and formatting-only changes.

## 6. Efficient Discovery & Tool Use

Use the smallest repository context necessary.

### Code Search
- Use Claude Code's native `Grep` tool for code search, scoped to `src/` or the smallest relevant target directory.
- Never perform unbounded repository searches or search `node_modules`, `.next`, build output, caches, generated files, or unrelated directories.
- Bypass `code-review-graph` for recently changed features or whenever its index is known/suspected to be stale or unverified. Use native `Grep` directly.
- Do not repeatedly query an empty, stale, or irrelevant graph.

### File Reading
- Use the native `Read` tool.
- For relevant files under roughly 250 lines, reading the full file is acceptable.
- For larger files, prefer targeted `offset`/`limit` ranges around the target function/component and relevant callers.
- Do not repeatedly reread files or context already available.
- Minimum sufficient context matters more than arbitrary line limits.

### Auxiliary Tools
- Do not invoke subagents, memory tools, or external/auxiliary skills for routine single-scope tasks unless they materially improve correctness.
- Never use a tool merely because it is available.
- Verify instead of guessing.

## 7. Before Changing Code

Before editing, establish:
- What the user requested.
- Whether the capability already exists.
- The closest existing implementation/pattern.
- Relevant callers and dependencies.
- Data flow and security boundaries.
- Existing schema/API/component contracts.
- Whether the change affects SEO, RLS, auth, storage, or public visibility.

For meaningful bugs, identify the root cause before changing code. Do not fix symptoms when the underlying implementation can be corrected safely.

## 8. Database Changes

Before modifying the database, inspect affected tables, columns, indexes, foreign keys, constraints, triggers, functions, RLS policies, relevant migrations, and existing queries.

- Prefer additive migrations.
- Never reset the database, drop production data, destructively alter existing structures, or recreate tables unnecessarily without explicit user approval.
- Never run a hosted/production migration as a test.
- Do not create a new DB concept when an existing table, column, or function can represent the requirement correctly.

## 9. Minimal Implementation

- Make the smallest correct change.
- Preserve existing architecture, naming, patterns, and behavior.
- Reuse existing code whenever possible.
- Do not refactor unrelated code.
- Do not add comments explaining obvious code.
- Do not add abstractions for hypothetical future requirements.
- Avoid N+1 queries and duplicate DB/API calls.
- Avoid unnecessary client-side fetching when existing server-side/SSR patterns are appropriate.
- Preserve SEO behavior when modifying public pages.

## 10. Next.js Rules

- Follow the repository's generated Next.js agent instructions.
- Verify the installed Next.js version and conventions for uncertain/version-sensitive APIs.
- Read only the specific relevant documentation under the installed Next.js package.
- Do not rely on remembered Next.js APIs when the installed version may differ.
- Preserve existing App Router conventions, server/client boundaries, metadata, caching, and rendering behavior unless the task requires changing them.

## 11. Verification

Verification should be proportional to risk.

- Normal code changes → targeted type-checks or focused tests when appropriate.
- Auth → verify auth/session behavior.
- RLS → verify actual access boundaries.
- Database → verify migration/schema behavior.
- R2 → verify upload/delete/access behavior.
- SEO → verify metadata, canonical URLs, robots, and sitemap impact.
- Public runtime behavior → focused runtime/browser verification when appropriate.

Do not automatically run broad test suites, full builds, or heavy browser/Playwright verification when a focused check is sufficient.

Use an existing project verification command/skill when it materially helps validate the change.

## 12. Final Review & Output

Before completing, review the diff for unintended changes, affected callers, security boundaries, and leftover debug code.

Response format:
- Changed files / brief implementation summary
- Verification performed
- Blockers (if any)
- One-sentence root cause (for non-trivial bugs only)

Omit conversational fluff and planning recaps.

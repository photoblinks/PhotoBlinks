@AGENTS.md

# PROJECT: PhotoBlinks MVP

PhotoBlinks is a photoshoot-location discovery platform for Karnataka and Kerala, India.

The MVP is ONLY:
1. Public customer website
2. Admin panel

The core product is location discovery. There are two content types:
- **Locations** — natural categories (Beach, Temple, Waterfall, Hill, Mountain, ...), single price (free/paid/unknown), browsable by state → city → category.
- **Studios** — preset/studio venues, no category, a list of pricing options (label + price) instead of a single price, browsable by state → city only.

## DO NOT build
- Photographers, makeup artists, customer accounts, booking, payments, reviews, ratings,
  messaging, equipment rental, costume rental, AI recommendations, or any other marketplace
  feature not explicitly listed in the spec.

## Infrastructure (already chosen — do not replace)
- Domain: GoDaddy · DNS: Cloudflare · Frontend: Vercel
- Database/Auth: Supabase (Postgres) — single database, no second backend
- Image storage: Cloudflare R2 (S3-compatible) — Supabase only stores URLs, never binaries
- Video: YouTube links (embedded, no API)
- Maps: Mapbox (map page + mini-maps), Google Maps deep link for "Go to Location"

## Rules
- Locations and categories are never hard-coded — always sourced from Supabase.
- Only `is_published = true` rows are publicly readable (enforced via RLS, see
  `supabase/migrations/`). Admin write access is via a Supabase-authenticated session
  checked against the `admins` table (`is_admin()` SQL function) — not the service-role key.
- The service-role client (`src/lib/supabase/admin.ts`) is server-only and reserved for
  bootstrap tasks (seeding the first admin). Never import it into client-reachable code.
- Every location/studio has a stable, slug-based URL. Slugs are generated once at creation
  from name + city and are not expected to change (state/city are dropdowns, not free text).
- Public pages are server-rendered for SEO (clean URLs, dynamic titles/meta, sitemap, OG tags).
- Admin images are pre-optimized by the admin before upload — the app does not resize/compress.
- Build one phase at a time (see the phase list in the original spec). Test each phase
  (build passes, RLS behaves as expected) before moving to the next.
- If a requirement is unclear, ask instead of inventing a feature.

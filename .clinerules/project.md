# PhotoBlinks Cline Project Contract

## PROJECT
PhotoBlinks is an existing Next.js application for pre-wedding photoshoot-location discovery.

## EXISTING VS NEW
Cline must never assume planned features already exist.

Existing foundation must be discovered and reused where appropriate:
- public website
- locations
- studios
- existing location gallery
- Save/Share
- admin panel
- existing authentication/infrastructure
- Supabase
- Cloudflare R2
- existing SEO
- existing media functionality

Planned NEW functionality includes:
- photographer signup/login
- photographer role
- photographer profile
- photographer dashboard
- photographer photo submissions
- title/description/phone for submissions
- admin photo approval/rejection
- R2 cleanup for rejected uploads
- approved photographer photo gallery
- full-screen gallery
- Call/WhatsApp actions tied to the specific photographer submission
- reports
- admin report approval/rejection
- R2 cleanup for rejected report uploads
- admin photo management for locations and studios
- relevant realtime updates

## INFRASTRUCTURE
- Supabase = database and authentication
- Cloudflare R2 = image binaries/storage
- Never introduce Supabase Storage for project images unless explicitly authorized
- Preserve existing infrastructure decisions

## SECURITY
- Never trust client-supplied roles or ownership
- Server-side authorization is mandatory
- Respect RLS
- Only authorized admins approve/reject
- Photographers can only manage their own content
- Public users see only approved content
- R2 operations must be securely authorized server-side
- Validate uploads, text, phone numbers and URLs
- Prevent XSS
- Never expose service-role credentials
- Consider upload abuse/rate limits

## DISCOVERY BEFORE CHANGE
For existing code, understand the architecture before modifying it.
Do not invent architecture when the repository can answer the question.
If requirements are unclear, ask or report the ambiguity rather than guessing.

## CLINE VS CLAUDE CODE
Cline and Claude Code are separate environments.

Cline is primarily used for:
- discovery
- investigation
- architecture analysis
- planning
- independent review
- selected isolated implementation when explicitly authorized

Claude Code is the primary implementation environment for major integrated changes.

Never assume permission to modify code.
Every task will specify whether modification is allowed.

## TOKEN EFFICIENCY
- Prefer targeted investigation
- Avoid whole-repository scans
- Avoid reading large files unnecessarily
- Produce concise findings
- Use the smallest amount of context needed
- Do not run expensive full verification unless explicitly requested

## SCOPE
Work only on the requested task.
Do not perform unrelated refactors, cleanup, package installation or architecture changes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { sweepOrphanedPhotographerUploads } from "@/lib/r2/orphan-sweep";

const bodySchema = z.object({ dryRun: z.boolean().optional() });

/** True only when the request carries `Authorization: Bearer <CRON_SECRET>`
 * matching the server-only CRON_SECRET env var exactly. If CRON_SECRET is
 * unset, this is always false (fails closed) rather than accepting any
 * token. Shared by both POST (admin-or-cron) and GET (cron-only) below. */
function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
}

/**
 * Fixed-purpose trigger for the orphaned photographer-upload R2 sweep
 * (src/lib/r2/orphan-sweep.ts). This is the documented invocation path for
 * a signed-in admin's manual run, a native Vercel Cron GET (see below), or
 * any other scheduler able to POST a bearer token — it is not a generic
 * delete endpoint: the request body carries only an optional dryRun flag,
 * never a bucket/prefix/key, and the handler always calls the same fixed
 * sweep function regardless of who's calling.
 *
 * Two independent ways to authorize, since a scheduler has no browser
 * session to present:
 *   - an authenticated admin session (getAuthorizedAdminUser())
 *   - a bearer token exactly matching the server-only CRON_SECRET env var
 *
 * dryRun defaults to true: an actual deletion run requires the caller —
 * already authenticated as admin or cron — to explicitly pass
 * `{ "dryRun": false }`. There is no public path to this route at all.
 */
export async function POST(request: Request) {
  const admin = await getAuthorizedAdminUser();
  const isAuthorizedCron = isAuthorizedCronRequest(request);

  if (!admin && !isAuthorizedCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await sweepOrphanedPhotographerUploads({ dryRun: parsed.data.dryRun ?? true });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}

/**
 * Native Vercel Cron entry point (see vercel.json — Vercel invokes cron
 * targets with GET). Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` to cron-triggered requests when the
 * project has a CRON_SECRET env var set, so this reuses the exact same
 * check as POST's cron path — no admin-session fallback here, since a
 * cron invocation never carries a browser session, and an unauthenticated
 * GET must never be able to trigger cleanup.
 *
 * dryRun is fixed to false — never read from a query param or body, so
 * there is no user-controlled input on this path at all. Any request
 * without a valid bearer token gets 401 and the sweep never runs.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepOrphanedPhotographerUploads({ dryRun: false });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}

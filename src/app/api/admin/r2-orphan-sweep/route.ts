import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { sweepOrphanedPhotographerUploads } from "@/lib/r2/orphan-sweep";
import { sweepOrphanedBlogImages } from "@/lib/r2/blog-orphan-sweep";

const bodySchema = z.object({ dryRun: z.boolean().optional() });

/** Runs both sweeps concurrently and returns a response that always carries
 * a per-sweep outcome. Uses Promise.allSettled (not Promise.all) so a
 * failure in one sweep never hides a successful result from the other: the
 * response body always contains each sweep's own entry — the full
 * SweepResult for a fulfilled sweep, an `{ error: "Sweep failed." }` marker
 * for a rejected one. The HTTP status is 500 only when at least one sweep
 * failed (preserving the existing "Sweep failed." 500 semantics for a fully
 * failing run) while a partial failure still reports the successful sweep's
 * result in the body. */
async function buildSweepResponse(dryRun: boolean) {
  const settled = await Promise.allSettled([
    sweepOrphanedPhotographerUploads({ dryRun }),
    sweepOrphanedBlogImages({ dryRun }),
  ]);

  const [photographersResult, blogResult] = settled;

  if (photographersResult.status === "rejected") {
    const reason = photographersResult.reason;
    console.error(
      "[r2-orphan-sweep] photographer sweep failed:",
      reason instanceof Error ? reason.message : "unknown error",
    );
  }
  if (blogResult.status === "rejected") {
    const reason = blogResult.reason;
    console.error(
      "[r2-orphan-sweep] blog sweep failed:",
      reason instanceof Error ? reason.message : "unknown error",
    );
  }

  return NextResponse.json(
    {
      photographers:
        photographersResult.status === "fulfilled" ? photographersResult.value : { error: "Sweep failed." },
      blog: blogResult.status === "fulfilled" ? blogResult.value : { error: "Sweep failed." },
    },
    { status: settled.some((result) => result.status === "rejected") ? 500 : 200 },
  );
}

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

  const dryRun = parsed.data.dryRun ?? true;
  return buildSweepResponse(dryRun);
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

  return buildSweepResponse(false);
}

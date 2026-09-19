import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActivityModule = "locations" | "studios";
export type ActivityAction =
  | "created"
  | "updated"
  | "published"
  | "unpublished"
  | "images_updated"
  | "faqs_updated"
  | "pricing_updated";

type ActivityEventInput = {
  module: ActivityModule;
  action: ActivityAction;
  entity_id: string;
  metadata?: Record<string, unknown>;
};

/** Appends one activity event. Written through the service-role client so the
 * browser has no write path to activity_events (that table has no
 * anon/authenticated policies) — the caller must therefore supply the actor's
 * user_id, which is derived server-side from the session, never from client
 * input. Best-effort: a tracking failure is logged and never fails the user's
 * actual action. */
export async function recordActivityEvent(
  user_id: string,
  input: ActivityEventInput,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("activity_events").insert({
    user_id,
    module: input.module,
    action: input.action,
    entity_id: input.entity_id,
    metadata: input.metadata ?? null,
  });
  if (error) {
    console.error(`[activity] ${input.module}.${input.action} failed:`, error.message);
  }
}

/** Records an activity event for the current request's authenticated user,
 * deriving user_id from the session (via auth.uid()) rather than any client
 * value. Convenience wrapper used by the location/studio server actions. */
export async function recordActivityFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: ActivityEventInput,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await recordActivityEvent(user.id, input);
}

import { createClient } from "@/lib/supabase/server";

/** Whether the given user id is a member of the `admins` table. Relies on
 * the `admins_admin_read` RLS policy (backed by the security-definer
 * is_admin() function) — safe to call with the normal request-scoped
 * client, no service-role key involved. */
export async function isAdminUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return data != null;
}

/** The current request's authenticated + admin user, or null if there's no
 * session or the signed-in user isn't an admin. Creates its own client —
 * for Server Components/Route Handlers that don't already hold one from an
 * earlier auth call in the same request (e.g. right after sign-in, where
 * reusing that call's client keeps the fresh session in scope). */
export async function getAuthorizedAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (await isAdminUser(supabase, user.id)) ? user : null;
}

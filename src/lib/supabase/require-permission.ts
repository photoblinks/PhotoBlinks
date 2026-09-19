import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/supabase/require-admin";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Canonical permission codes. Keep in sync with the seeded
 * employee_permissions catalog (20260916000000_employee_management.sql). */
export const PERMISSION = {
  LOCATIONS_EDIT: "locations.edit",
  LOCATIONS_PUBLISH: "locations.publish",
  STUDIOS_EDIT: "studios.edit",
  STUDIOS_PUBLISH: "studios.publish",
  DASHBOARD_VIEW: "dashboard.view",
  ACTIVITY_VIEW: "activity.view",
} as const;

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION];

/** True if the request's user is a legacy admin OR an active employee whose
 * role grants `code`. Wraps the security-definer has_permission() RPC, so it
 * is safe to call with the request-scoped client (RLS still applies). */
export async function hasPermission(
  supabase: SupabaseServerClient,
  code: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", { p_code: code });
  return !error && data === true;
}

export type AuthorizedStaff = {
  user: { id: string; email?: string };
  isAdmin: boolean;
  /** Effective permission check: admins pass everything, employees pass only
   * codes their active role grants. */
  can: (code: string) => boolean;
  /** True when the staff member holds ANY of the given codes (admins: always). */
  canAny: (codes: readonly string[]) => boolean;
};

/** The current request's authenticated admin-or-active-employee, or null if
 * there's no session or the user is neither. Uses the request-scoped client
 * plus the security-definer is_employee()/get_my_permissions() RPCs — no
 * service-role key involved. */
export async function getAuthorizedStaffUser(): Promise<AuthorizedStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isAdmin = await isAdminUser(supabase, user.id);
  let permissions = new Set<string>();

  if (!isAdmin) {
    // A plain signed-in user must be an active employee to enter /admin at
    // all; otherwise they're bounced back to login.
    const { data: isEmployee } = await supabase.rpc("is_employee");
    if (isEmployee !== true) return null;

    const { data: codes } = await supabase.rpc("get_my_permissions");
    permissions = new Set((codes as string[]) ?? []);
  }

  return {
    user: { id: user.id, email: user.email },
    isAdmin,
    can: (code) => isAdmin || permissions.has(code),
    canAny: (codes) => isAdmin || codes.some((code) => permissions.has(code)),
  };
}

/** Server-action guard. Returns a machine-checkable reason so callers can map
 * it to an inline error or a redirect — never returns "authorized" without a
 * real server-side check. */
export async function checkModulePermission(
  supabase: SupabaseServerClient,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: "unauthenticated" | "forbidden" }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!(await hasPermission(supabase, code))) return { ok: false, reason: "forbidden" };
  return { ok: true };
}

/** Server-action guard for admin-only actions (e.g. deletion). Same shape as
 * checkModulePermission so callers handle both identically. */
export async function checkAdmin(
  supabase: SupabaseServerClient,
): Promise<{ ok: true } | { ok: false; reason: "unauthenticated" | "forbidden" }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!(await isAdminUser(supabase, user.id))) return { ok: false, reason: "forbidden" };
  return { ok: true };
}

/** Page-level guard for permission-scoped pages. Call at the top of every
 * page whose module requires one of the given codes. */
export async function requireModulePage(codes: readonly string[]): Promise<void> {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");
  if (!staff.canAny(codes)) redirect("/admin");
}

/** Page-level guard for admin-only pages. Employees are redirected away even
 * if they type the URL directly; authorization is enforced here server-side,
 * never only through hidden navigation. */
export async function requireAdminPage(): Promise<void> {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");
  if (!staff.isAdmin) redirect("/admin");
}

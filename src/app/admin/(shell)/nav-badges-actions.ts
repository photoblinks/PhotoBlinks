"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";

export type NavBadgeCounts = Partial<Record<string, number>>;

const PAGE_KEY_BY_HREF: Record<string, "users" | "photographer_profiles"> = {
  "/admin/users": "users",
  "/admin/photographer-profiles": "photographer_profiles",
};

/** Sidebar badge counts keyed by nav href. Admin-only; returns {} otherwise. */
export async function getNavBadgeCounts(): Promise<NavBadgeCounts> {
  if (!(await getAuthorizedAdminUser())) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_nav_badge_counts").single();
  if (error || !data) return {};

  const row = data as {
    pending_comments: number;
    pending_photos: number;
    pending_reports: number;
    new_users: number;
    new_photographers: number;
  };
  return {
    "/admin/comments": Number(row.pending_comments),
    "/admin/photographer-photos": Number(row.pending_photos),
    "/admin/location-reports": Number(row.pending_reports),
    "/admin/users": Number(row.new_users),
    "/admin/photographer-profiles": Number(row.new_photographers),
  };
}

/** Marks a "new since last visit" page as seen by the current admin. */
export async function markNavPageSeen(href: string): Promise<void> {
  const pageKey = PAGE_KEY_BY_HREF[href];
  if (!pageKey) return;

  const admin = await getAuthorizedAdminUser();
  if (!admin) return;

  const supabase = await createClient();
  await supabase
    .from("admin_page_seen")
    .upsert({ user_id: admin.id, page_key: pageKey, seen_at: new Date().toISOString() });
}

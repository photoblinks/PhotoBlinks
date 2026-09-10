"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// reviewed_by is always the authenticated admin's own user ID derived
// server-side from the session — never accepted from the browser. RLS
// admin_all already gates these writes; the is_admin() check in the shell
// layout redirects non-admins before an action can even be invoked.
//
// Every update is scoped to .eq("status", "pending") so a stale admin tab
// can't blindly overwrite a report another admin already reviewed — if
// zero rows are affected, error is null but data comes back empty, which
// the caller treats as "already reviewed" rather than silently succeeding.

type ModerationResult = { ok: true } | { error: "already_reviewed" | "failed" };

export async function approveReport(id: string, adminNote?: string): Promise<ModerationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "failed" };

  const { data, error } = await supabase
    .from("location_reports")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote?.trim() || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: "failed" };
  if (!data || data.length === 0) return { error: "already_reviewed" };

  revalidatePath("/admin/location-reports");
  return { ok: true };
}

export async function rejectReport(id: string, adminNote?: string): Promise<ModerationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "failed" };

  const { data, error } = await supabase
    .from("location_reports")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote?.trim() || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: "failed" };
  if (!data || data.length === 0) return { error: "already_reviewed" };

  revalidatePath("/admin/location-reports");
  return { ok: true };
}

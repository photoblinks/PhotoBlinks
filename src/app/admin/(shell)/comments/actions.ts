"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";

// Plain RLS-gated table writes — admin_all (is_admin()) already allows
// these, no service-role or security-definer bypass needed. The public
// location page picks up an approval/rejection within its normal 24h
// unstable_cache window, same as every other admin change that affects
// public data in this project (sponsored photographers, etc.) — not
// force-revalidated here.

export async function approveComment(id: string) {
  const supabase = await createClient();
  await supabase.from("location_comments").update({ status: "approved" }).eq("id", id);
  revalidatePublicContent();
  revalidatePath("/admin/comments");
}

export async function rejectComment(id: string) {
  const supabase = await createClient();
  await supabase.from("location_comments").update({ status: "rejected" }).eq("id", id);
  revalidatePublicContent();
  revalidatePath("/admin/comments");
}

export async function deleteComment(id: string) {
  const supabase = await createClient();
  await supabase.from("location_comments").delete().eq("id", id);
  revalidatePublicContent();
  revalidatePath("/admin/comments");
}

"use server";

import { revalidatePath } from "next/cache";
import { locationTag } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";

// Plain RLS-gated table writes — admin_all (is_admin()) already allows
// these, no service-role or security-definer bypass needed. Only the
// affected location's comment/rating/count reads are invalidated.

type CommentStatusUpdate = { status: "approved" | "rejected" } | "delete";

async function moderateComment(id: string, change: CommentStatusUpdate) {
  const supabase = await createClient();
  const { data: comment } = await supabase
    .from("location_comments")
    .select("location_id")
    .eq("id", id)
    .maybeSingle();

  if (change === "delete") {
    await supabase.from("location_comments").delete().eq("id", id);
  } else {
    await supabase.from("location_comments").update(change).eq("id", id);
  }

  if (comment) revalidatePublicContent(locationTag(comment.location_id));
  revalidatePath("/admin/comments");
}

export async function approveComment(id: string) {
  await moderateComment(id, { status: "approved" });
}

export async function rejectComment(id: string) {
  await moderateComment(id, { status: "rejected" });
}

export async function deleteComment(id: string) {
  await moderateComment(id, "delete");
}

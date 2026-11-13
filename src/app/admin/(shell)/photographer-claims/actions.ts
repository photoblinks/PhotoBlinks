"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublicContent } from "@/lib/revalidate-public";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";

const idSchema = z.string().uuid();
const BASE = "/admin/photographer-claims";

/** Approves a claim: approve_photographer_claim (admin-only, re-checks the
 * profile is still unclaimed) assigns the profile to the claimant's verified
 * account. The claimant already set a password in the claim form. */
export async function approveClaim(id: string) {
  if (!idSchema.safeParse(id).success) redirect(BASE);
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_photographer_claim", { p_claim_id: id });
  if (error) {
    const message = error.code === "P0001" ? error.message : "Could not approve this claim.";
    redirect(`${BASE}?error=${encodeURIComponent(message)}`);
  }

  revalidatePublicContent(CACHE_TAGS.photographers);
  revalidatePath(BASE);
  revalidatePath("/admin/photographer-profiles");
  redirect(`${BASE}?approved=1`);
}

export async function rejectClaim(id: string) {
  if (!idSchema.safeParse(id).success) redirect(BASE);
  if (!(await getAuthorizedAdminUser())) redirect("/admin/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_claim_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) redirect(`${BASE}?error=${encodeURIComponent("Could not reject this claim.")}`);

  revalidatePath(BASE);
  redirect(BASE);
}

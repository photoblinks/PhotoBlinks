"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/supabase/require-admin";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/admin/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  // Legacy admins and active employees are both admitted; module-level access
  // is enforced server-side downstream (per-page and per-action), never here.
  const isAdmin = await isAdminUser(supabase, data.user.id);
  if (!isAdmin) {
    const { data: isEmployee } = await supabase.rpc("is_employee");
    if (isEmployee !== true) {
      await supabase.auth.signOut();
      redirect(
        `/admin/login?error=${encodeURIComponent("This account does not have access to the admin panel.")}`,
      );
    }
  }

  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

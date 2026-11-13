"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fail = (message: string) => redirect(`/set-password?error=${encodeURIComponent(message)}`);

  if (password.length < 6) fail("Password must be at least 6 characters.");
  if (password !== confirm) fail("The two passwords do not match.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("setPassword failed", { code: error.code, status: error.status });
    fail("Could not save your password. Please try again.");
  }

  redirect("/photographer");
}

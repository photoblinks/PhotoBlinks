"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedAdminUser, isAdminUser } from "@/lib/supabase/require-admin";

// Every action here re-checks the admin gate server-side even though the
// admin shell layout already redirects non-admins away: the actions are the
// security boundary, and hidden/unreachable UI must never be the only guard.
// Writes go through the request-scoped client so RLS still applies; the
// service-role client is used only to mint the auth user during provisioning.

// 72 = bcrypt's input limit; longer values would be silently truncated.
const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(72, "Password must be at most 72 characters.");

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  full_name: z.string().trim().max(120, "Name is too long.").optional(),
  role_id: z.string().uuid("Select a role."),
  password: passwordSchema.optional(),
});

export type EmployeeFormState = { error: string } | { success: string } | undefined;

export type EmployeeActionResult = { ok: true } | { error: string };

export async function inviteEmployee(
  _prevState: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const admin = await getAuthorizedAdminUser();
  if (!admin) return { error: "Not authorized." };

  let values: z.infer<typeof inviteSchema>;
  try {
    values = inviteSchema.parse({
      email: String(formData.get("email") ?? ""),
      full_name: String(formData.get("full_name") ?? ""),
      role_id: String(formData.get("role_id") ?? ""),
      password: String(formData.get("password") ?? "") || undefined,
    });
  } catch (err) {
    return { error: err instanceof z.ZodError ? err.issues[0].message : "Invalid form data." };
  }

  const supabase = await createClient();

  // The role must exist before we mint an account or link an employee.
  const { data: role } = await supabase
    .from("employee_roles")
    .select("id")
    .eq("id", values.role_id)
    .maybeSingle();
  if (!role) return { error: "The selected role does not exist." };

  let userId: string;
  let passwordSet = false;
  let linkedExisting = false;

  // Already-registered account (e.g. an existing admin)? Link it instead of
  // failing the invite. The lookup is a security-definer RPC guarded by
  // is_admin(), so it can't be used to probe arbitrary emails.
  const { data: existingUserId } = await supabase.rpc("admin_find_user_by_email", {
    p_email: values.email,
  });

  if (existingUserId) {
    // Linking never touches an existing account's password, even if one was
    // typed: otherwise an admin could take over any registered account.
    userId = existingUserId as string;
    linkedExisting = true;
  } else {
    const adminAuth = createAdminClient();
    // With a password the admin hands credentials over directly (no email is
    // sent); without one Supabase emails the invite link.
    const { data: inviteData, error: inviteError } = values.password
      ? await adminAuth.auth.admin.createUser({
          email: values.email,
          password: values.password,
          email_confirm: true,
        })
      : await adminAuth.auth.admin.inviteUserByEmail(values.email);
    passwordSet = Boolean(values.password) && !inviteError;

    if (inviteError) {
      // Log the real error server-side (never echoed to the browser), then
      // best-effort re-check for a concurrent sign-up between the lookup and
      // the invite.
      console.error("[inviteEmployee] invite failed:", inviteError.message);
      const { data: retryUserId } = await supabase.rpc("admin_find_user_by_email", {
        p_email: values.email,
      });
      if (retryUserId) {
        userId = retryUserId as string;
      } else {
        return { error: "Could not invite this account. Please try again." };
      }
    } else if (inviteData?.user) {
      userId = inviteData.user.id;
    } else {
      return { error: "Could not create the account." };
    }
  }

  const { data: employee, error: insertError } = await supabase
    .from("employees")
    .insert({
      user_id: userId,
      role_id: values.role_id,
      full_name: values.full_name || null,
      invited_by: admin.id,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique_violation on employees.user_id: either a duplicate
    // invite race or the account is already an employee.
    if (insertError.code === "23505") {
      return { error: "This account is already an employee." };
    }
    console.error("[inviteEmployee] employee insert failed:", insertError.message);
    return { error: "Could not create the employee record. Please try again." };
  }
  if (!employee) {
    return { error: "Could not create the employee record. Please try again." };
  }

  revalidatePath("/admin/employees");
  if (linkedExisting) {
    return {
      success: `${values.email} already has an account and was linked as an employee. Their password was not changed${
        values.password ? " (use Set password on the employee row)" : ""
      }.`,
    };
  }
  return {
    success: passwordSet
      ? `Account created for ${values.email} with the password you set. No email was sent — share it securely.`
      : `Invitation sent to ${values.email}.`,
  };
}

export async function setEmployeePassword(id: string, password: string): Promise<EmployeeActionResult> {
  const admin = await getAuthorizedAdminUser();
  if (!admin) return { error: "Not authorized." };

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (!employee) return { error: "This employee no longer exists." };

  // Admin accounts are never reset from here: a linked legacy admin could
  // otherwise be taken over by any other admin. They change their own password.
  if (await isAdminUser(supabase, employee.user_id)) {
    return { error: "Administrator accounts must change their password themselves." };
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(employee.user_id, {
    password: parsed.data,
  });
  if (error) {
    console.error("[setEmployeePassword] update failed:", error.message);
    return { error: "Could not set the password. Please try again." };
  }
  return { ok: true };
}

export async function setEmployeeActive(id: string, nextValue: boolean): Promise<EmployeeActionResult> {
  const admin = await getAuthorizedAdminUser();
  if (!admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .update({ is_active: nextValue })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not update this employee. Please try again." };
  if (!data || data.length === 0) return { error: "This employee no longer exists." };

  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function updateEmployeeRole(id: string, roleId: string): Promise<EmployeeActionResult> {
  const admin = await getAuthorizedAdminUser();
  if (!admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("employee_roles")
    .select("id")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return { error: "The selected role does not exist." };

  const { data, error } = await supabase
    .from("employees")
    .update({ role_id: roleId })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not update this employee. Please try again." };
  if (!data || data.length === 0) return { error: "This employee no longer exists." };

  revalidatePath("/admin/employees");
  return { ok: true };
}

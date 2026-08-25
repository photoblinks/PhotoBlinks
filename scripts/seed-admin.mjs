// One-off: creates the first admin user via Supabase Auth (service role,
// bypasses RLS) and adds them to the `admins` table so is_admin() picks
// them up. Run once; use the normal login flow / password reset afterward.
//
// Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <password>
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: userData, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (createError) {
  console.error("Failed to create user:", createError.message);
  process.exit(1);
}

const { error: adminError } = await supabase
  .from("admins")
  .insert({ user_id: userData.user.id });

if (adminError) {
  console.error("Failed to add to admins table:", adminError.message);
  process.exit(1);
}

console.log(`Admin created: ${email} (user_id: ${userData.user.id})`);

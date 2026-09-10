import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmitPhotoForm } from "./submit-photo-form";

export const metadata: Metadata = {
  title: "Submit a Photo",
  robots: { index: false, follow: false },
};

export default async function SubmitPhotoPage() {
  const supabase = await createClient();

  // The shell layout no longer redirects unauthenticated visitors away by
  // itself (the dashboard route needs to render its own verification-
  // pending view for a no-session request) — this page still requires a
  // real session on its own, same as before.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in/photographer");

  // Fetch the photographer's profile phone for the form default.
  const { data: profile } = await supabase
    .from("photographer_profiles")
    .select("phone_number")
    .eq("user_id", user!.id)
    .single();

  // Fetch published locations for the dropdown — id and name only.
  // The server validates the selected location_id again in the action.
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("is_published", true)
    .order("name");

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Submit a Photo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Submit a pre-wedding shoot photo for a specific location. It will be reviewed before appearing publicly.
      </p>

      {/* Validation success/error now flow through the form's useActionState
          state instead of ?success=1 / ?error= redirects, so the uploaded
          photo and typed fields survive a failed validation client-side. */}
      <SubmitPhotoForm locations={locations ?? []} defaultPhone={profile?.phone_number ?? ""} />
    </div>
  );
}

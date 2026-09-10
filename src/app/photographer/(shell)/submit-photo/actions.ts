"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedPhotographerUser } from "@/lib/supabase/require-photographer";

// Accepts Indian mobile numbers with/without +91, spaces, dashes — same rule
// used in photographer signup and profile actions.
const PHONE_REGEX = /^[\d+\s-]{7,20}$/;

// Photographers may submit at most this many photos in any rolling 24-hour
// window. Enforced via a count query against the submission table.
// Keeps the check simple and co-located with the data — no stats table needed.
const DAILY_SUBMISSION_LIMIT = 5;

const submissionSchema = z.object({
  location_id: z.string().uuid("Select a valid location."),
  storage_key: z.string().min(1, "Upload a photo first."),
  image_url: z.string().url("Invalid image URL."),
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(120, "Title must be 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
  phone_number: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
});

/** State returned by submitPhoto to the client form (via useActionState).
 * error/success are mutually exclusive. On error the form stays mounted, so
 * the already-uploaded R2 object (storage_key/image_url) and the typed fields
 * survive — the photographer fixes only the invalid field instead of
 * re-uploading. The unauthorized/session-expired case still redirects: that's
 * not a validation error, the user has to sign in / complete onboarding
 * first. All server-side checks below remain the security boundary — this
 * state return changes only how the client renders the outcome. */
export type SubmitPhotoState = {
  error?: string;
  success?: boolean;
};

export async function submitPhoto(
  _prevState: SubmitPhotoState,
  formData: FormData,
): Promise<SubmitPhotoState> {
  // photographer_id always comes from the authenticated session — never from the form.
  const photographer = await getAuthorizedPhotographerUser();
  if (!photographer) redirect("/photographer/signup");

  let values: ReturnType<typeof submissionSchema.parse>;
  try {
    values = submissionSchema.parse({
      location_id: String(formData.get("location_id") ?? ""),
      storage_key: String(formData.get("storage_key") ?? ""),
      image_url: String(formData.get("image_url") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      phone_number: String(formData.get("phone_number") ?? ""),
    });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : "Invalid form data.";
    return { error: message };
  }

  // Validate storage_key is within this photographer's R2 namespace.
  // Expected shape: photographers/{session-user-id}/{filename}  (3 segments, no subdirs).
  // The client cannot forge a key that passes this check because the user ID
  // comes from the server session, not the request body.
  const expectedPrefix = `photographers/${photographer.id}/`;
  const keyFilename = values.storage_key.slice(expectedPrefix.length);
  if (
    !values.storage_key.startsWith(expectedPrefix) ||
    !keyFilename ||                    // no filename after prefix
    keyFilename.includes("/") ||       // no subdirectory injection
    keyFilename.includes("..") ||      // path traversal
    values.storage_key.includes("\\") // Windows-style path traversal
  ) {
    return { error: "Invalid storage key." };
  }

  // image_url must exactly match the configured R2 public host + storage_key.
  // Prevents arbitrary external image URLs from being linked.
  const expectedImageUrl = `${process.env.R2_PUBLIC_URL}/${values.storage_key}`;
  if (values.image_url !== expectedImageUrl) {
    return { error: "Invalid image URL." };
  }

  const supabase = await createClient();

  // Server-side location validation: must exist and be published.
  // Client-supplied location_id identifies the target — server confirms it.
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("id", values.location_id)
    .eq("is_published", true)
    .maybeSingle();

  if (!location) {
    return { error: "Location not found or not available for submissions." };
  }

  // Rate limit: count submissions created by this photographer in the last 24h.
  const { count } = await supabase
    .from("photographer_photo_submissions")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographer.id)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((count ?? 0) >= DAILY_SUBMISSION_LIMIT) {
    return {
      error: `Daily submission limit reached (${DAILY_SUBMISSION_LIMIT} per day). Please try again tomorrow.`,
    };
  }

  // Insert: photographer_id and status are server-controlled, never from form.
  // storage_bucket comes from the environment — client cannot choose the bucket.
  // RLS pps_photographer_insert enforces these at the DB level as a second layer.
  const { error } = await supabase.from("photographer_photo_submissions").insert({
    photographer_id: photographer.id,
    location_id: values.location_id,
    storage_key: values.storage_key,
    storage_bucket: process.env.R2_BUCKET_NAME,
    image_url: values.image_url,
    title: values.title,
    description: values.description ?? null,
    phone_number: values.phone_number,
    status: "pending",
  });

  if (error) {
    // Unique constraint on storage_key surfaces here if the same R2 object is
    // submitted twice — this is the intended duplicate-prevention mechanism.
    //
    // Any other insert failure here leaves the R2 object the photographer
    // already uploaded (above, via /api/photographer/r2-presign) orphaned —
    // there is no submission row to attach an r2_deletion_status to, since
    // the row was never created. deletePhotographerSubmissionObject()
    // (src/lib/r2/upload.ts) is safe to reuse for this specific key once
    // it's known, but there is deliberately no endpoint here that lets the
    // browser trigger a delete directly. A real fix needs a server-side
    // sweep that lists photographers/{id}/ objects and diffs them against
    // existing storage_key rows — left for a later phase rather than
    // building an unsafe ad hoc deletion path to close this one case.
    return {
      error:
        error.code === "23505"
          ? "This photo has already been submitted."
          : error.message,
    };
  }

  return { success: true };
}

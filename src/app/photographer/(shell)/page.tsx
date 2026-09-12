 import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { resendConfirmationEmail } from "@/lib/auth-actions";
import { Camera } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PhotographerProfileSummary } from "@/components/photographer/profile-summary";
import { CompleteProfileModal } from "@/components/photographer/complete-profile-modal";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { FieldError } from "@/components/ui/field";
import { getActiveCountries, getActiveStates } from "@/lib/public-data";
import { normalizeRelation, ensurePhotographerProfileFromMetadata } from "@/lib/supabase/require-photographer";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

type SubmissionRow = {
  id: string;
  image_url: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  locations: { id: string; name: string; slug: string }[] | null;
};

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PhotographerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; pending_email?: string; resent?: string }>;
}) {
  const { error, pending_email: pendingEmail, resent } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session at all — the normal state for a few seconds right after
  // signup, since email confirmations are required and Supabase issues no
  // session until the link is clicked (see signUpPhotographer). There is
  // no photographer_profiles row yet either way (its creation is deferred
  // to the same confirmation), so there's nothing real to show regardless
  // — this renders the verification-pending state directly at /photographer
  // instead of a separate page. pending_email is display-only (came from
  // the signup form itself, not authentication) — an unrelated visitor
  // with no session and no marker still gets sent to sign in, same as
  // before.
  if (!user) {
    if (!pendingEmail) redirect("/sign-in/photographer");

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">Email verification pending</p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            We sent a confirmation link to <span className="font-medium">{pendingEmail}</span>.
            Verify it to unlock your dashboard — submissions, profile editing, and everything else.
          </p>
          {resent === "1" ? (
            <p className="mt-3 text-sm font-medium text-amber-900 dark:text-amber-200">
              Confirmation email resent.
            </p>
          ) : (
            <>
              {error && <FieldError className="mt-3">{error}</FieldError>}
              <form action={resendConfirmationEmail} className="mt-3">
                <input type="hidden" name="email" value={pendingEmail} />
                <input type="hidden" name="next" value="/photographer" />
                <input
                  type="hidden"
                  name="return_to"
                  value={`/photographer?pending_email=${encodeURIComponent(pendingEmail)}`}
                />
                <AuthSubmitButton label="Resend verification email" pendingLabel="Sending…" />
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Already verified this email in another tab?{" "}
          <Link href="/sign-in/photographer?mode=login" className="font-medium text-pb-brand hover:underline">
            Sign in
          </Link>{" "}
          to continue.
        </p>
      </div>
    );
  }

  // Consume any pending signup metadata into a profile row before reading
  // — idempotent (a no-op for an account with no such metadata, e.g. a
  // Google sign-in; a harmless unique-constraint hit if the shell layout's
  // own attempt already landed it). Done unconditionally, before the one
  // read below, rather than read-then-maybe-insert-then-read-again: Next.js
  // dedupes identical fetch() calls within a single render pass regardless
  // of cache options, so a second identical read here would silently
  // reuse the first (pre-insert) response instead of seeing the write.
  await ensurePhotographerProfileFromMetadata(supabase, user!);

  const { data: profile } = await supabase
    .from("photographer_profiles")
    .select("*, countries(name), states(name)")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile) {
    const [countries, states] = await Promise.all([getActiveCountries(), getActiveStates()]);
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-4 py-10 sm:px-6">
        <CompleteProfileModal countries={countries} states={states} error={error} />
      </div>
    );
  }

  // One query, own rows only, newest first. The locations join (id/name/slug)
  // lets us show where the photo was submitted and link a view for approved
  // photos without a second round-trip per row.
  const { data: submissions } = await supabase
    .from("photographer_photo_submissions")
    .select("id, image_url, title, status, rejection_reason, created_at, locations(id, name, slug)")
    .eq("photographer_id", user!.id)
    .order("created_at", { ascending: false });

  const rows = (submissions ?? []) as SubmissionRow[];
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <RealtimeRefresh
        table="photographer_photo_submissions"
        filter={`photographer_id=eq.${user!.id}`}
      />
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
            Welcome, {profile?.display_name ?? "Photographer"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your photographer profile and keep track of your photo submissions.
          </p>
        </div>
        <Button render={<Link href="/photographer/submit-photo" />} size="sm" className="w-fit sm:w-auto">
          Submit a photo
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your public photographer identity and contact details.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotographerProfileSummary
              profile={{
                ...profile,
                country_name: normalizeRelation(profile.countries)?.name ?? null,
                state_name: normalizeRelation(profile.states)?.name ?? null,
              }}
              email={user?.email}
            />
          </CardContent>
          <CardFooter>
            <Button render={<Link href="/photographer/profile" />} variant="outline" size="sm">
              Edit profile
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account status</CardTitle>
            <CardDescription>Your photographer account status.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{profile?.is_active ? "Active" : "Suspended"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Account email</dt>
                <dd className="truncate">{user?.email}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Submission history</CardTitle>
          <CardDescription>Photos you&apos;ve submitted and their current status.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
              <Camera className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">No submissions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Submit a pre-wedding shoot photo for a location to see it here.
              </p>
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Photo</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border">
                        <Image
                          src={row.image_url}
                          alt={row.title}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-44 max-w-md">
                      <p className="line-clamp-2 font-medium">{row.title}</p>
                      {row.status === "rejected" && row.rejection_reason && (
                        <p className="mt-1 text-xs text-destructive">
                          Reason: {row.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-40">
                      {row.locations?.[0] ? (
                        row.status === "approved" ? (
                          <Link
                            href={`/location/${row.locations[0].slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-pb-brand hover:underline"
                          >
                            {row.locations[0].name}
                          </Link>
                        ) : (
                          <span className="line-clamp-2 text-muted-foreground">
                            {row.locations[0].name}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSubmittedAt(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? "secondary"}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
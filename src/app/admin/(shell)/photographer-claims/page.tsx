import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModulePage, PERMISSION } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveClaim, rejectClaim } from "./actions";

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

type ClaimRow = {
  id: string;
  full_name: string;
  studio_name: string;
  email: string;
  phone_number: string;
  proof_url: string;
  message: string;
  status: string;
  created_at: string;
  photographer_profiles: {
    id: string;
    user_id: string | null;
    studio_name: string;
    display_name: string;
    city: string;
    phone_number: string;
    instagram_url: string | null;
    portfolio_url: string | null;
    states: { name: string } | null;
  } | null;
};

/** Same comparison the DB phone index uses: last 10 digits. */
const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);

export default async function AdminPhotographerClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; approved?: string }>;
}) {
  await requireModulePage([PERMISSION.PHOTOGRAPHERS_PUBLISH]);

  const { status: statusParam, error, approved } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "pending";

  const supabase = await createClient();
  const { data } = await supabase
    .from("photographer_claim_requests")
    .select(
      "id, full_name, studio_name, email, phone_number, proof_url, message, status, created_at, photographer_profiles(id, user_id, studio_name, display_name, city, phone_number, instagram_url, portfolio_url, states(name))",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  const claims = (data ?? []) as unknown as ClaimRow[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Claim Requests</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Owners claiming a bulk-imported profile. Their email is already verified by a one-time code;
        compare the details with our record before approving. Approving gives that email the profile
        and sends a set-password link.
      </p>

      <div className="mb-6 flex gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`${"/admin/photographer-claims"}?status=${tab.value}`}
            className={
              tab.value === status
                ? "rounded-full bg-pb-brand px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {approved && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
          Claim approved. A set-password email was sent.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        {claims.map((claim) => {
          const profile = claim.photographer_profiles;
          const phoneMatches = profile ? phoneKey(profile.phone_number) === phoneKey(claim.phone_number) : false;
          const alreadyClaimed = profile ? profile.user_id !== null : false;
          return (
            <div key={claim.id} className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{claim.full_name}</span>
                <Badge variant={phoneMatches ? "default" : "destructive"}>
                  {phoneMatches ? "Phone matches profile" : "Phone does NOT match"}
                </Badge>
                {alreadyClaimed && claim.status === "pending" && (
                  <Badge variant="destructive">Profile already claimed</Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(claim.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>

              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <dl className="space-y-1">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Claimant</dt>
                  <dd>Photography name: {claim.studio_name}</dd>
                  <dd>Email (verified): {claim.email}</dd>
                  <dd>Phone: {claim.phone_number}</dd>
                  <dd>
                    Link:{" "}
                    <a href={claim.proof_url} target="_blank" rel="noopener noreferrer" className="text-pb-brand hover:underline">
                      {claim.proof_url}
                    </a>
                  </dd>
                  <dd className="whitespace-pre-wrap">Message: {claim.message}</dd>
                </dl>
                <dl className="space-y-1">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Our record</dt>
                  {profile ? (
                    <>
                      <dd>
                        <Link href={`/admin/photographer-profiles/${profile.id}`} className="text-pb-brand hover:underline">
                          {profile.studio_name}
                        </Link>{" "}
                        ({profile.display_name})
                      </dd>
                      <dd>
                        {profile.city}, {profile.states?.name ?? "—"}
                      </dd>
                      <dd>Phone: {profile.phone_number}</dd>
                      {profile.instagram_url && <dd>Instagram: {profile.instagram_url}</dd>}
                      {profile.portfolio_url && <dd>Portfolio: {profile.portfolio_url}</dd>}
                    </>
                  ) : (
                    <dd>Profile no longer exists.</dd>
                  )}
                </dl>
              </div>

              {claim.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <form action={approveClaim.bind(null, claim.id)}>
                    <Button type="submit" size="sm" disabled={alreadyClaimed}>
                      Approve
                    </Button>
                  </form>
                  <form action={rejectClaim.bind(null, claim.id)}>
                    <Button type="submit" size="sm" variant="destructive">
                      Reject
                    </Button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        {claims.length === 0 && <p className="text-sm text-muted-foreground">No {status} claims.</p>}
      </div>
    </div>
  );
}

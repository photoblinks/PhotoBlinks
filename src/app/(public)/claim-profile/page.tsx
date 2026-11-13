import type { Metadata } from "next";
import { ClaimProfileForm } from "@/components/photographer/claim-profile-form";

export const metadata: Metadata = {
  title: "Claim your photographer profile",
  description: "Is your photography profile listed on PhotoBlinks? Claim your profile to manage it.",
  robots: { index: false, follow: true },
};

export default function ClaimProfilePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Claim your photography profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Is your photography profile already listed on PhotoBlinks? Find it, tell us a little about yourself and
        verify your email. After our team checks your details (24–48 hours) you&apos;ll be able to
        manage the profile.
      </p>
      <ClaimProfileForm />
    </div>
  );
}

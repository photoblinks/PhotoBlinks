import type { Metadata } from "next";
import { ShareNameForm } from "../share-location-client";

export const metadata: Metadata = {
  title: "Create Location Share",
  robots: { index: false, follow: false },
};

export default function NewShareNamePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Create Location Share</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Name this list, then pick the locations to share with your client.
      </p>
      <ShareNameForm />
    </div>
  );
}

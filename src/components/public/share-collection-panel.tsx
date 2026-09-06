"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createShareLink, regenerateShareLink, revokeShareLink } from "@/app/(public)/favourites/actions";

/** "Share Favourites" panel on /favourites. `shareUrl` is null when the
 * user has no active share link (never created one, or it's revoked) —
 * the create/regenerate/revoke actions are plain server actions bound to
 * forms, so each click does a normal (fast, small) round trip and the
 * server component re-renders with the new state; no client-side session
 * needed here since this whole page is already auth-gated server-side. */
export function ShareCollectionPanel({ shareUrl }: { shareUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({ title: "My PhotoBlinks Favourites", url: shareUrl });
    } catch {
      // user cancelled the share sheet
    }
  }

  if (!shareUrl) {
    return (
      <form action={createShareLink}>
        <Button type="submit" variant="outline">
          Share Favourites
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm font-medium">Anyone with this link can view your favourites</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">
          {shareUrl}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copyLink}>
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={nativeShare} className="sm:hidden">
          Share
        </Button>
      </div>
      <div className="mt-1 flex gap-2">
        <form action={regenerateShareLink}>
          <Button type="submit" variant="ghost" size="sm">
            Regenerate Link
          </Button>
        </form>
        <form action={revokeShareLink}>
          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
            Stop Sharing
          </Button>
        </form>
      </div>
    </div>
  );
}

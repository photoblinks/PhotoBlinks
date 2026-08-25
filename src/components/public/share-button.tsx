"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function subscribeNoop() {
  return () => {};
}
function getCanNativeShare() {
  return typeof navigator !== "undefined" && !!navigator.share;
}
function getServerCanNativeShare() {
  return false;
}

export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  // `navigator.share` never changes after mount, so this is a one-shot
  // capability read rather than a real subscription — useSyncExternalStore
  // still fits: it's the React-sanctioned way to read a browser-only API
  // without a client/server hydration mismatch (SSR has no `navigator`).
  const canNativeShare = useSyncExternalStore(
    subscribeNoop,
    getCanNativeShare,
    getServerCanNativeShare,
  );

  async function handleClick() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user cancelled the share sheet — nothing to do
      }
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (canNativeShare) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={handleClick}>
        Share
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Share
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          render={
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          Share on WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

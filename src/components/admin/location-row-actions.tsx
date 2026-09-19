"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toggleLocationPublished, deleteLocation } from "@/app/admin/(shell)/locations/actions";

/** Publish/Unpublish + Delete controls for one location row. Calls the
 * server actions directly (not via <form action>) so failures — permission
 * denials, RLS zero-row results, or a stale row that no longer exists — can
 * be shown inline instead of silently no-opping. Visibility of each button is
 * decided server-side and passed in; the actions re-check authorization. */
export function LocationRowActions({
  id,
  isPublished,
  canPublish,
  canDelete,
}: {
  id: string;
  isPublished: boolean;
  canPublish: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"toggle" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(kind: "toggle" | "delete") {
    setPending(kind);
    setMessage(null);
    const result =
      kind === "toggle"
        ? await toggleLocationPublished(id, !isPublished)
        : await deleteLocation(id);
    setPending(null);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {canPublish && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run("toggle")}
          >
            {pending === "toggle"
              ? "Saving…"
              : isPublished
                ? "Unpublish"
                : "Publish"}
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending !== null}
            onClick={() => run("delete")}
          >
            {pending === "delete" ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}

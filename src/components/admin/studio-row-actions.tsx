"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toggleStudioPublished, deleteStudio } from "@/app/admin/(shell)/studios/actions";

/** Publish/Unpublish + Delete controls for one studio row. Mirrors
 * LocationRowActions: calls the server actions directly so failures can be
 * shown inline instead of silently no-opping. Button visibility is decided
 * server-side; the actions re-check authorization. */
export function StudioRowActions({
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
      kind === "toggle" ? await toggleStudioPublished(id, !isPublished) : await deleteStudio(id);
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

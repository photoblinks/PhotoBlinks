"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveReport, rejectReport } from "@/app/admin/(shell)/location-reports/actions";

/** Approve/Reject controls for one pending report row. Calls the server
 * actions directly (not via <form action>) so the "already reviewed by
 * another admin" outcome — a real possibility once two admins have the
 * queue open at once — can be shown inline instead of silently no-opping. */
export function LocationReportModerationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handle(kind: "approve" | "reject") {
    setPending(kind);
    setMessage(null);
    const note = window.prompt("Admin note (optional):") ?? "";
    const result = kind === "approve" ? await approveReport(id, note) : await rejectReport(id, note);
    setPending(null);

    if ("error" in result) {
      setMessage(
        result.error === "already_reviewed"
          ? "This report has already been reviewed."
          : "Couldn't update this report. Please try again.",
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => handle("approve")}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => handle("reject")}
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPhotographerStatus } from "@/app/admin/(shell)/photographer-profiles/actions";
import type { PhotographerStatus } from "@/app/admin/(shell)/photographer-profiles/types";

const ACTIONS: { status: PhotographerStatus; label: string; variant: "default" | "outline" | "destructive" }[] = [
  { status: "active", label: "Activate", variant: "default" },
  { status: "on_hold", label: "Put on hold", variant: "outline" },
  { status: "suspended", label: "Suspend", variant: "destructive" },
];

/** Status controls for one photographer profile. Shows every status except
 * the current one; failures are shown inline. */
export function PhotographerStatusActions({
  id,
  current,
}: {
  id: string;
  current: PhotographerStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(status: PhotographerStatus) {
    setPending(true);
    setError(null);
    const result = await setPhotographerStatus(id, status);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.filter((a) => a.status !== current).map((a) => (
          <Button
            key={a.status}
            type="button"
            size="sm"
            variant={a.variant}
            disabled={pending}
            onClick={() => handleClick(a.status)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Segment error boundary for /admin/performance - covers render/redirect
 * failures beyond the inline RPC error states the page itself renders. */
export default function PerformanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employee Performance</h1>
      <div className="rounded-xl bg-destructive/10 p-4 ring-1 ring-destructive/30">
        <p className="text-sm font-medium text-destructive">
          Something went wrong while loading the performance dashboard.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <Button className="mt-3" type="button" variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}

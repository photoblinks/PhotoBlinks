"use client";

// Manual "Start AI Verification" control. One click queues every eligible live location; this page
// then drives the queue one location at a time (a Server Action per location) while it stays open.
// Closing the page pauses the run (the queue and all spending are saved): "Resume" continues it.
// No cron, no schedule: nothing runs unless an administrator clicked and the page is open.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RunItem, RunProgress } from "@/lib/ai-verification/progress";
import {
  cancelVerificationRun,
  getRunProgress,
  pauseVerificationRun,
  processNextVerificationLocation,
  resumeVerificationRun,
  retryFailedLocations,
  startVerificationRun,
} from "./run-actions";

const PER_LOCATION_CAP_INR = 2;
const POLL_MS = 4000;
const REFRESH_EVERY = 10; // refresh the review list below every N processed locations

const inr = (n: number) => `₹${n.toFixed(2)}`;

type Notice = { kind: "error" | "info"; text: string } | null;

const STATUS_LABEL: Record<RunItem["status"], string> = {
  pending: "Waiting",
  running: "Checking…",
  done: "Done",
  failed: "Failed",
  budget_exhausted: "₹2 cap reached",
  skipped: "Skipped",
};
const STATUS_VARIANT: Record<RunItem["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  running: "default",
  done: "secondary",
  failed: "destructive",
  budget_exhausted: "destructive",
  skipped: "outline",
};

export function VerificationRunControl({
  initial,
  canRun,
  keysConfigured,
}: {
  initial: RunProgress;
  canRun: boolean;
  keysConfigured: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<RunProgress>(initial);
  const [driving, setDriving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const stopRef = useRef(false);
  const processedRef = useRef(0);

  const run = progress.run;
  const isActive = run != null && (run.status === "running" || run.status === "queued");
  const otherSession = run?.status === "running" && !run.stalled && !driving;
  const canResume = canRun && isActive && !driving && (run.status === "queued" || run.stalled);
  const canStart = canRun && keysConfigured && !isActive && progress.eligibleCount > 0 && !driving;
  const canRetry = canRun && keysConfigured && !driving && run?.status === "succeeded" && run.failed > 0;

  // Drives the queue: one location per Server Action call, until idle, stopped or paused.
  const drive = useCallback(
    async (runId: string, lease: string) => {
      setDriving(true);
      setPausing(false);
      stopRef.current = false;
      try {
        for (;;) {
          if (stopRef.current) {
            const paused = await pauseVerificationRun(runId);
            if ("progress" in paused) setProgress(paused.progress);
            setNotice({ kind: "info", text: "Paused. Nothing more will be spent until you resume." });
            break;
          }
          const r = await processNextVerificationLocation(runId, lease);
          if ("error" in r) {
            setNotice({ kind: "error", text: r.error });
            break;
          }
          setProgress(r.progress);
          if (r.step.kind === "idle") {
            setNotice({ kind: "info", text: "Verification finished. Review the proposals below; nothing changes until you approve." });
            router.refresh();
            break;
          }
          if (r.step.kind === "stopped") {
            setNotice({ kind: "error", text: r.step.reason });
            router.refresh();
            break;
          }
          processedRef.current += 1;
          if (processedRef.current % REFRESH_EVERY === 0) router.refresh();
        }
      } catch {
        setNotice({ kind: "error", text: "Connection lost. The run and its spending are saved: click Resume to continue." });
      } finally {
        setDriving(false);
        setPausing(false);
      }
    },
    [router],
  );

  // Another tab / a closed tab: keep the numbers live.
  useEffect(() => {
    if (!isActive || driving) return;
    const t = setInterval(async () => {
      const r = await getRunProgress();
      if ("progress" in r) setProgress(r.progress);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isActive, driving]);

  // Closing the page stops the driver; make that visible.
  useEffect(() => {
    if (!driving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [driving]);

  const start = async () => {
    setConfirmStart(false);
    setBusy(true);
    setNotice(null);
    const r = await startVerificationRun();
    setBusy(false);
    if ("error" in r) return setNotice({ kind: "error", text: r.error });
    setProgress(r.progress);
    processedRef.current = 0;
    void drive(r.runId, r.lease);
  };

  const continueRun = async (action: "resume" | "retry") => {
    if (!run) return;
    setBusy(true);
    setNotice(null);
    const r = action === "resume" ? await resumeVerificationRun(run.id) : await retryFailedLocations(run.id);
    setBusy(false);
    if ("error" in r) return setNotice({ kind: "error", text: r.error });
    setProgress(r.progress);
    void drive(r.runId, r.lease);
  };

  const cancel = async () => {
    setConfirmCancel(false);
    if (!run) return;
    stopRef.current = true;
    setBusy(true);
    const r = await cancelVerificationRun(run.id);
    setBusy(false);
    if ("error" in r) return setNotice({ kind: "error", text: r.error });
    setProgress(r.progress);
    setNotice({ kind: "info", text: "Run cancelled. Proposals already created stay pending for review." });
    router.refresh();
  };

  const pct = run && run.totalLocations > 0 ? Math.min(100, Math.round((run.processed / run.totalLocations) * 100)) : 0;
  const current = progress.items.find((i) => i.status === "running");

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>AI verification run</CardTitle>
            <CardDescription>
              Checks every live location with no check in the last 30 days, one at a time. Up to {inr(PER_LOCATION_CAP_INR)} per
              location, no overall cap. Every result is only a <strong>pending proposal</strong>: no location changes until you approve it.
            </CardDescription>
          </div>
          {canRun && (
            <div className="flex flex-wrap gap-2">
              {canStart && (
                <Button onClick={() => setConfirmStart(true)} disabled={busy}>
                  Start AI Verification
                </Button>
              )}
              {canResume && (
                <Button onClick={() => continueRun("resume")} disabled={busy}>
                  Resume
                </Button>
              )}
              {canRetry && (
                <Button variant="outline" onClick={() => continueRun("retry")} disabled={busy}>
                  Retry failed ({run?.failed})
                </Button>
              )}
              {driving && (
                <Button
                  variant="outline"
                  onClick={() => {
                    stopRef.current = true;
                    setPausing(true);
                  }}
                  disabled={pausing}
                >
                  {pausing ? "Pausing after this location…" : "Pause"}
                </Button>
              )}
              {isActive && (
                <Button variant="destructive" onClick={() => setConfirmCancel(true)} disabled={busy}>
                  Cancel run
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!canRun && <p className="text-sm text-muted-foreground">Only administrators can start a verification run.</p>}
        {canRun && !keysConfigured && (
          <p className="text-sm text-destructive">BRAVE_API_KEY and GEMINI_API_KEY are not configured on the server.</p>
        )}
        {canRun && !isActive && progress.eligibleCount === 0 && !driving && (
          <p className="text-sm text-muted-foreground">No eligible locations: every live location was checked in the last 30 days.</p>
        )}
        {notice && (
          <p role="status" className={`rounded-md border px-3 py-2 text-sm ${notice.kind === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground"}`}>
            {notice.text}
          </p>
        )}
        {otherSession && (
          <p className="text-sm text-muted-foreground">
            This run is active in another session. You can resume it here if that session stops responding (about 2 minutes).
          </p>
        )}
        {run?.status === "queued" && run.pauseReason && <p className="text-sm text-muted-foreground">Paused: {run.pauseReason}</p>}
        {run?.status === "running" && run.stalled && (
          <p className="text-sm text-muted-foreground">The page that was driving this run stopped responding. Click Resume to continue.</p>
        )}

        {run && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Badge variant={run.status === "running" && !run.stalled ? "default" : "secondary"}>
                {run.status === "queued" ? "paused" : run.stalled ? "stalled" : run.status}
              </Badge>
              <span>
                <strong>{run.processed}</strong> of <strong>{run.totalLocations}</strong> locations
              </span>
              <span>
                Spent <strong>{inr(run.totalCostInr)}</strong>
              </span>
              <span className="text-muted-foreground">
                {progress.counts.failed > 0 ? `${progress.counts.failed} failed · ` : ""}
                {progress.counts.budgetExhausted > 0 ? `${progress.counts.budgetExhausted} hit the ₹2 cap · ` : ""}
                {progress.counts.pending} waiting
              </span>
              <span>
                <strong>{progress.proposals}</strong> pending proposal{progress.proposals === 1 ? "" : "s"} created
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-label="Progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>

            {driving && current && <p className="text-sm text-muted-foreground">Checking {current.name}… keep this page open.</p>}
            {run.lastError && run.status !== "succeeded" && <p className="text-xs text-muted-foreground">Last issue: {run.lastError}</p>}

            {progress.items.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Attempts</TableHead>
                      <TableHead className="text-right">Cost (max ₹2)</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {progress.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{i.attempts}</TableCell>
                        <TableCell className="text-right">{inr(i.costInr)}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={i.error ?? undefined}>
                          {i.error ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">Showing the 40 most recently updated locations.</p>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={confirmStart} onOpenChange={setConfirmStart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start AI verification?</DialogTitle>
            <DialogDescription>
              This will check {progress.eligibleCount} live location{progress.eligibleCount === 1 ? "" : "s"} one after another and
              spend real money on search and AI calls: up to {inr(PER_LOCATION_CAP_INR)} per location, with no overall cap. Keep this page
              open while it runs; closing it pauses the run and you can resume it. Results are pending proposals only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStart(false)}>
              Not now
            </Button>
            <Button onClick={start}>Start AI Verification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this run?</DialogTitle>
            <DialogDescription>
              Locations still waiting will be skipped. Proposals already created stay pending for review, and money already spent is
              kept in the record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep running
            </Button>
            <Button variant="destructive" onClick={cancel}>
              Cancel run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

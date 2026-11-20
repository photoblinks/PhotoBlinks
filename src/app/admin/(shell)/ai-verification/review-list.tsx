"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveField, approveMany, rejectField, type ReviewResult } from "./actions";

export type ReviewField = {
  id: string;
  fieldName: string;
  currentValue: string | null;
  proposedValue: string;
  confidence: number | null;
  evidence: string | null;
  sourceUrls: string[];
};

export type ReviewGroup = {
  locationId: string;
  name: string;
  slug: string;
  fields: ReviewField[];
};

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function fieldLabel(name: string): string {
  const text = name.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const fieldCount = (n: number) => `${n} change${n === 1 ? "" : "s"}`;

export function ReviewList({ groups }: { groups: ReviewGroup[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewId, setViewId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Only keep selections for locations that are still listed.
  const live = new Set(groups.map((g) => g.locationId));
  const selectedIds = [...selected].filter((id) => live.has(id));
  const allSelected = groups.length > 0 && selectedIds.length === groups.length;
  const viewGroup = groups.find((g) => g.locationId === viewId) ?? null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // `label` names exactly what was acted on, so the banner can never be read as
  // applying to a different location.
  const run = (task: () => Promise<ReviewResult>, label: string, onOk?: () => void) =>
    startTransition(async () => {
      const result = await task();
      setNotice("ok" in result ? { ok: true, message: `${label}: ${result.message}` } : { error: `${label}: ${result.error}` });
      if ("ok" in result) onOk?.();
    });

  const approveSelected = () => {
    const chosen = groups.filter((g) => selected.has(g.locationId));
    const ids = chosen.flatMap((g) => g.fields.map((f) => f.id));
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Approve ${fieldCount(ids.length)} across ${chosen.length} location${chosen.length === 1 ? "" : "s"}? This updates the live locations.`,
    );
    if (ok) run(() => approveMany(ids), `${chosen.length} selected location${chosen.length === 1 ? "" : "s"}`, () => setSelected(new Set()));
  };

  const approveAllInPopup = (group: ReviewGroup) =>
    run(() => approveMany(group.fields.map((f) => f.id)), group.name);

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role={"error" in notice ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            "error" in notice ? "border-destructive/40 text-destructive" : "border-green-600/40 text-green-700"
          }`}
        >
          {"error" in notice ? notice.error : notice.message}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  setSelected(checked ? new Set(groups.map((g) => g.locationId)) : new Set())
                }
                aria-label="Select all locations"
              />
              Select all
            </label>
            <Button onClick={approveSelected} disabled={selectedIds.length === 0 || pending}>
              {pending ? "Approving…" : `Approve selected (${selectedIds.length})`}
            </Button>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Location</TableHead>
                  <TableHead>Awaiting approval</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.locationId}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(group.locationId)}
                        onCheckedChange={() => toggle(group.locationId)}
                        aria-label={`Select ${group.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell className="text-muted-foreground">{fieldCount(group.fields.length)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setNotice(null); setViewId(group.locationId); }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={viewGroup !== null} onOpenChange={(open) => !open && setViewId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {viewGroup && (
            <>
              <DialogHeader>
                <DialogTitle>{viewGroup.name}</DialogTitle>
                <DialogDescription>
                  {fieldCount(viewGroup.fields.length)} waiting for your approval.
                </DialogDescription>
              </DialogHeader>

              {notice && "error" in notice && (
                <p role="alert" className="text-sm text-destructive">{notice.error}</p>
              )}

              <ul className="divide-y rounded-lg border">
                {viewGroup.fields.map((field) => {
                  const links = field.sourceUrls.filter(isValidHttpUrl);
                  return (
                    <li key={field.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{fieldLabel(field.fieldName)}</p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">{field.currentValue || "—"}</span>
                            <span className="mx-2 text-muted-foreground">→</span>
                            <span className="font-mono font-medium">{field.proposedValue}</span>
                          </p>
                          {field.confidence !== null && (
                            <p className="text-xs text-muted-foreground">
                              Confidence {(field.confidence * 100).toFixed(0)}%
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => run(() => approveField(field.id, viewGroup.locationId), `${viewGroup.name} · ${fieldLabel(field.fieldName)}`)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => run(() => rejectField(field.id, viewGroup.locationId), `${viewGroup.name} · ${fieldLabel(field.fieldName)}`)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                      {field.evidence && (
                        <p className="line-clamp-3 text-xs text-muted-foreground">{field.evidence}</p>
                      )}
                      {links.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {links.map((url, i) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={url}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Source {links.length > 1 ? i + 1 : ""}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewId(null)}>
                  Close
                </Button>
                <Button disabled={pending} onClick={() => approveAllInPopup(viewGroup)}>
                  {pending ? "Approving…" : `Approve all (${viewGroup.fields.length})`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

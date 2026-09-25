"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LOCATION_INFO_FIELDS, type LocationInfoTableConfig } from "@/lib/location-info-fields";
import { saveLocationInfoTableConfig } from "./actions";

/** Admin configuration for which location information fields appear in the
 * editorial location information tables: enable/disable, reorder, and
 * optional per-field label overrides. Field identity is fixed in code
 * (LOCATION_INFO_FIELDS) — this form only edits the deltas stored on
 * site_settings. */
export function LocationInfoTableConfigForm({ config }: { config: LocationInfoTableConfig }) {
  const canonicalCodes = LOCATION_INFO_FIELDS.map((field) => field.code);

  const [order, setOrder] = useState<string[]>(() => {
    const configured = (config.order ?? []).filter((code) => canonicalCodes.includes(code));
    const rest = canonicalCodes.filter((code) => !configured.includes(code));
    return [...configured, ...rest];
  });
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(config.enabled ?? canonicalCodes),
  );
  const [labels, setLabels] = useState<Record<string, string>>(config.labels ?? {});

  const fieldByCode = new Map(LOCATION_INFO_FIELDS.map((field) => [field.code, field]));

  function move(index: number, direction: -1 | 1) {
    setOrder((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={saveLocationInfoTableConfig} className="rounded-xl border bg-white p-4 sm:p-5">
      <input type="hidden" name="order" value={JSON.stringify(order)} />

      <div className="flex flex-col gap-2">
        {order.map((code, index) => {
          const field = fieldByCode.get(code);
          if (!field) return null;
          const isEnabled = enabled.has(code);
          return (
            <div key={code} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Checkbox
                checked={isEnabled}
                onCheckedChange={(checked) =>
                  setEnabled((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(code);
                    else next.delete(code);
                    return next;
                  })
                }
              />
              {isEnabled && <input type="hidden" name="enabled" value={code} />}

              <span className={`w-56 shrink-0 text-sm ${isEnabled ? "" : "text-muted-foreground"}`}>
                {field.label}
              </span>

              <Input
                name={`label_${code}`}
                value={labels[code] ?? ""}
                placeholder="Override label (optional)"
                onChange={(e) => setLabels((prev) => ({ ...prev, [code]: e.target.value }))}
                className="h-8"
              />

              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  aria-label={`Move ${field.label} up`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === order.length - 1}
                  aria-label={`Move ${field.label} down`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="submit" size="sm" className="mt-4">
        Save field settings
      </Button>
    </form>
  );
}

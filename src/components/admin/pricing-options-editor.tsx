"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { id: string; label: string; price: string };

function newRow(label = "", price = ""): Row {
  return { id: crypto.randomUUID(), label, price };
}

/** Editable list of studio pricing options (label + price). Submits as two
 * parallel repeated hidden inputs (pricing_label / pricing_price), zipped
 * back into pairs by index in the server action. */
export function PricingOptionsEditor({
  defaultValue,
}: {
  defaultValue?: { label: string; price: number }[];
}) {
  const [rows, setRows] = useState<Row[]>(
    (defaultValue ?? []).map((o) => newRow(o.label, String(o.price))),
  );

  function update(id: string, field: "label" | "price", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function move(index: number, direction: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <input type="hidden" name="pricing_label" value={row.label} />
          <input type="hidden" name="pricing_price" value={row.price} />
          <Input
            placeholder="Label (e.g. 1 Hour)"
            value={row.label}
            onChange={(e) => update(row.id, "label", e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Price"
            type="number"
            min="1"
            value={row.price}
            onChange={(e) => update(row.id, "price", e.target.value)}
            className="w-28"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={index === 0}
            onClick={() => move(index, -1)}
            aria-label="Move up"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={index === rows.length - 1}
            onClick={() => move(index, 1)}
            aria-label="Move down"
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onClick={() => remove(row.id)}
            aria-label="Remove pricing option"
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setRows((prev) => [...prev, newRow()])}
      >
        Add pricing option
      </Button>
    </div>
  );
}

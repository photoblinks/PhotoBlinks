"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Row = { id: string; question: string; answer: string };

function newRow(question = "", answer = ""): Row {
  return { id: crypto.randomUUID(), question, answer };
}

/** Editable list of location FAQs (question + answer). Submits as two
 * parallel repeated hidden inputs (faq_question / faq_answer), zipped back
 * into pairs by index in the server action — same pattern as
 * PricingOptionsEditor. */
export function FaqEditor({
  defaultValue,
}: {
  defaultValue?: { question: string; answer: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(
    (defaultValue ?? []).map((f) => newRow(f.question, f.answer)),
  );

  function update(id: string, field: "question" | "answer", value: string) {
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
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <input type="hidden" name="faq_question" value={row.question} />
          <input type="hidden" name="faq_answer" value={row.answer} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">FAQ {index + 1}</span>
            <div className="flex items-center gap-1">
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
                aria-label="Remove FAQ"
              >
                ×
              </Button>
            </div>
          </div>
          <Input
            placeholder="Question"
            value={row.question}
            onChange={(e) => update(row.id, "question", e.target.value)}
          />
          <Textarea
            placeholder="Answer"
            value={row.answer}
            onChange={(e) => update(row.id, "answer", e.target.value)}
            rows={2}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setRows((prev) => [...prev, newRow()])}
      >
        Add FAQ
      </Button>
    </div>
  );
}

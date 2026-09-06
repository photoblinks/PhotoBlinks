"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Five clickable stars for choosing a 1-5 rating. Uncontrolled-looking but
 * reports back through `onChange` — no star is pre-selected, so a rating
 * is always a deliberate choice, never an accidental default. */
export function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayValue = hovered ?? value;

  return (
    <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className="p-0.5"
        >
          <Star
            className={cn(
              "size-6 transition-colors",
              star <= displayValue ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}

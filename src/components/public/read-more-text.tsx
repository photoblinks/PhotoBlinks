"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

// Roughly the point past which prose exceeds 3 lines at this container's
// width/font size — just a heuristic to skip showing a "Read more" button
// on text that's already short enough to display in full.
const CLAMP_THRESHOLD = 200;

/** Long text clamped to 3 lines with a Read more/less toggle. Renders the
 * text plainly (no button) when it's short enough to already fit. */
export function ReadMoreText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= CLAMP_THRESHOLD) {
    return <p className={className}>{text}</p>;
  }

  return (
    <div>
      <p className={`${className ?? ""} ${expanded ? "" : "line-clamp-3"}`}>{text}</p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-sm font-medium text-pb-brand underline"
      >
        {expanded ? "Read less" : "Read more"}
        <ArrowRight className={`size-3.5 transition-transform ${expanded ? "-rotate-180" : ""}`} />
      </button>
    </div>
  );
}

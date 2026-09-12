"use client";

import { ArrowUp, ArrowDown, Copy, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Contextual toolbar shown above the selected block — move up/down,
 * duplicate, delete, and the drag handle. Mirrors Gutenberg's per-block
 * toolbar without any new dependency. */
export function BlockToolbar({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  dragHandleProps,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-white p-0.5 shadow-sm">
      <button
        type="button"
        aria-label="Drag to reorder"
        className="flex size-7 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...dragHandleProps}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="px-1.5 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <Button type="button" variant="ghost" size="icon-xs" disabled={!canMoveUp} onClick={onMoveUp} aria-label="Move up">
        <ArrowUp className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" disabled={!canMoveDown} onClick={onMoveDown} aria-label="Move down">
        <ArrowDown className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={onDuplicate} aria-label="Duplicate block">
        <Copy className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete block">
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}

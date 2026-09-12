"use client";

import { useState } from "react";
import {
  Heading2,
  Pilcrow,
  List as ListIcon,
  Quote as QuoteIcon,
  Image as ImageIcon,
  Images,
  HelpCircle,
  MapPin,
  MousePointerClick,
  Minus,
  MoveVertical,
  Plus,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { BlockType } from "./types";

export const BLOCK_LIBRARY: {
  type: BlockType;
  label: string;
  category: "Text" | "Media" | "PhotoBlinks" | "Layout";
  icon: typeof Pilcrow;
}[] = [
  { type: "paragraph", label: "Paragraph", category: "Text", icon: Pilcrow },
  { type: "heading2", label: "Heading (H2)", category: "Text", icon: Heading2 },
  { type: "heading3", label: "Heading (H3)", category: "Text", icon: Heading2 },
  { type: "list", label: "List", category: "Text", icon: ListIcon },
  { type: "quote", label: "Quote", category: "Text", icon: QuoteIcon },
  { type: "image", label: "Image", category: "Media", icon: ImageIcon },
  { type: "gallery", label: "Gallery", category: "Media", icon: Images },
  { type: "faq", label: "FAQ", category: "PhotoBlinks", icon: HelpCircle },
  { type: "locationLink", label: "Location", category: "PhotoBlinks", icon: MapPin },
  { type: "cta", label: "Call to Action", category: "PhotoBlinks", icon: MousePointerClick },
  { type: "divider", label: "Divider", category: "Layout", icon: Minus },
  { type: "spacer", label: "Spacer", category: "Layout", icon: MoveVertical },
];

const CATEGORIES = ["Text", "Media", "PhotoBlinks", "Layout"] as const;

/** The Gutenberg-style block inserter: a "+" trigger that opens a searchable
 * command palette grouped into Text / Media / PhotoBlinks / Layout. Built
 * entirely from the project's existing cmdk-based Command component and
 * base-ui Popover — no new dependency. */
export function BlockInserter({
  onInsert,
  variant = "gap",
}: {
  onInsert: (type: BlockType) => void;
  /** "gap" renders the thin hover-revealed "+" used between blocks;
   * "button" renders a full labeled button, used for the initial/empty
   * canvas state. */
  variant?: "gap" | "button";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          variant === "gap" ? (
            <button
              type="button"
              aria-label="Add block"
              className="group/inserter relative flex h-4 w-full items-center justify-center"
            >
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover/inserter:bg-border" />
              <span className="relative z-10 flex size-5 scale-0 items-center justify-center rounded-full bg-pb-brand text-white opacity-0 shadow-sm transition-all group-hover/inserter:scale-100 group-hover/inserter:opacity-100 group-focus-visible/inserter:scale-100 group-focus-visible/inserter:opacity-100">
                <Plus className="size-3.5" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-pb-brand hover:text-pb-brand"
            >
              <Plus className="size-4" />
              Add your first block
            </button>
          )
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search blocks…" />
          <CommandList>
            <CommandEmpty>No blocks found.</CommandEmpty>
            {CATEGORIES.map((category) => {
              const items = BLOCK_LIBRARY.filter((b) => b.category === category);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={category} heading={category}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.type}
                      value={item.label}
                      onSelect={() => {
                        onInsert(item.type);
                        setOpen(false);
                      }}
                    >
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

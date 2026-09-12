"use client";

import { useState } from "react";
import { MapPin, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

/** Searchable location selector for the Location block — the "visual
 * location selector" the block-editor rewrite calls for, built from the
 * project's existing cmdk Command + Popover (no new dependency). Only ever
 * offered the published-locations list the page already loaded (see
 * new/page.tsx and [id]/edit/page.tsx), so an admin can't pick a location
 * the public renderer would just hide anyway. */
export function LocationPicker({
  locations,
  value,
  onChange,
}: {
  locations: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = locations.find((l) => l.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 truncate">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              {selected ? selected.name : <span className="text-muted-foreground">Select a location…</span>}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search published locations…" />
          <CommandList>
            <CommandEmpty>No locations found.</CommandEmpty>
            {locations.map((location) => (
              <CommandItem
                key={location.id}
                value={location.name}
                onSelect={() => {
                  onChange(location.id);
                  setOpen(false);
                }}
              >
                {location.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

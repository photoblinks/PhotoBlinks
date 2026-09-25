"use client";

import { useState } from "react";
import { X, MapPin, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

/** Multi-select variant of LocationPicker for the Location Information Table
 * block. Only ever offered the published-locations list the page already
 * loaded, and already-selected locations are filtered out of the picker so
 * the same location can't be added twice. */
export function LocationMultiPicker({
  locations,
  value,
  onChange,
}: {
  locations: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = locations.filter((l) => value.includes(l.id));
  const available = locations.filter((l) => !value.includes(l.id));

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((location) => (
            <span
              key={location.id}
              className="flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-sm"
            >
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              {location.name}
              <button
                type="button"
                aria-label={`Remove ${location.name}`}
                onClick={() => onChange(value.filter((id) => id !== location.id))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">Add a location…</span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-80 p-0">
          <Command>
            <CommandInput placeholder="Search published locations…" />
            <CommandList>
              <CommandEmpty>No locations found.</CommandEmpty>
              {available.map((location) => (
                <CommandItem
                  key={location.id}
                  value={location.name}
                  onSelect={() => {
                    onChange([...value, location.id]);
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
    </div>
  );
}

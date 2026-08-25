"use client";

import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HomeFilter } from "@/components/public/home-filter";

type Option = { id: string; name: string; slug: string };
type City = Option & { state_id: string };

/** Mobile-only "Filters" trigger over the map that opens the full HomeFilter
 * form in a left-side drawer, instead of the form taking over the page. */
export function MapFiltersDrawer({
  states,
  cities,
  categories,
  initial,
}: {
  states: Option[];
  cities: City[];
  categories: Option[];
  initial: {
    state?: string;
    city?: string;
    category?: string;
    pricing?: string;
    lat?: string;
    lng?: string;
  };
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-md hover:bg-muted sm:hidden"
          />
        }
      >
        <SlidersHorizontal className="size-4" />
        Filters
      </DialogTrigger>
      <DialogContent className="top-0 left-0 flex h-full w-[85vw] max-w-xs translate-x-0 translate-y-0 flex-col overflow-y-auto rounded-none p-5 data-open:zoom-in-100 data-open:slide-in-from-left data-closed:zoom-out-100 data-closed:slide-out-to-left">
        <DialogHeader>
          <DialogTitle>Filters</DialogTitle>
        </DialogHeader>
        <HomeFilter
          states={states}
          cities={cities}
          categories={categories}
          basePath="/locations/map"
          initial={initial}
          className="gap-2 divide-y divide-border rounded-none bg-transparent p-0 shadow-none"
        />
      </DialogContent>
    </Dialog>
  );
}

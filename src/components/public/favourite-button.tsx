"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFavourites } from "./favourites-provider";

/** Heart toggle for favouriting a location. Used both as a compact overlay
 * on LocationCard (icon only) and, with `showLabel`, on the location detail
 * page. The click handler always stops propagation/prevents default first
 * — LocationCard's whole surface is itself a `<Link>`, so without this a
 * tap on the heart would also navigate to the location page. */
export function FavouriteButton({
  locationId,
  className,
  showLabel,
}: {
  locationId: string;
  className?: string;
  showLabel?: boolean;
}) {
  const { ready, favouriteIds, toggle, requireAuth } = useFavourites();
  const [pending, setPending] = useState(false);
  const favourited = favouriteIds.has(locationId);

  // Icon-only (card) variant only ever appears once a location is saved —
  // no heart at all on an unsaved card, so favouriting only happens from
  // the location detail page's Save button, never from a listing grid.
  if (!showLabel && !favourited) return null;

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    setPending(true);

    const authed = await requireAuth();
    if (!authed) {
      setPending(false);
      return;
    }

    const result = await toggle(locationId);
    setPending(false);

    if (result === "error") {
      toast.error("Couldn't update your favourite. Please try again.");
    }
  }

  return (
    <button
      type="button"
      aria-label={favourited ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={favourited}
      onClick={handleClick}
      disabled={!ready || pending}
      className={cn(
        "flex items-center justify-center transition-colors disabled:opacity-60",
        showLabel
          ? "gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-sm hover:bg-muted"
          : "size-8 rounded-full bg-white/90 shadow-sm hover:bg-white",
        className,
      )}
    >
      <Heart
        className={cn("size-4", favourited ? "fill-destructive text-destructive" : "text-foreground/70")}
      />
      {showLabel && <span>{favourited ? "Saved" : "Save"}</span>}
    </button>
  );
}

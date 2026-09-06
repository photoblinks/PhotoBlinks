"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toggleFavourite as toggleFavouriteAction } from "@/app/(public)/favourites/actions";

type ToggleResult = "favourited" | "unfavourited" | "sign_in_required" | "error";

type FavouritesContextValue = {
  /** null while the initial session/favourites check is in flight, so
   * FavouriteButton can avoid flashing an "unfavourited" heart before we
   * actually know. */
  ready: boolean;
  signedIn: boolean;
  favouriteIds: Set<string>;
  toggle: (locationId: string) => Promise<ToggleResult>;
};

const FavouritesContext = createContext<FavouritesContextValue | null>(null);

// Client-only: whether the viewer is signed in, and which locations they've
// favourited, can't be known from the server without forcing every public
// page that renders a LocationCard into dynamic (cookie-reading) rendering
// — the whole site's ISR/caching model depends on public pages staying
// cookie-free (see src/lib/public-data.ts). So this reads the session and
// the favourites list in the browser, once, via the browser Supabase client
// (src/lib/supabase/client.ts), and shares it through context so every
// FavouriteButton on the page reuses the same fetch instead of querying
// per-card.
export function FavouritesProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadFavourites(userId: string) {
      const { data } = await supabase.from("favourites").select("location_id").eq("user_id", userId);
      if (cancelled) return;
      setFavouriteIds(new Set((data ?? []).map((row) => row.location_id)));
    }

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(!!user);
      if (user) await loadFavourites(user.id);
      if (!cancelled) setReady(true);
    }

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSignedIn(!!session?.user);
      if (session?.user) {
        loadFavourites(session.user.id);
      } else {
        setFavouriteIds(new Set());
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const toggle = useCallback(async (locationId: string): Promise<ToggleResult> => {
    if (!signedIn) return "sign_in_required";

    const wasFavourited = favouriteIds.has(locationId);
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavourited) next.delete(locationId);
      else next.add(locationId);
      return next;
    });

    const result = await toggleFavouriteAction(locationId);

    if ("error" in result) {
      // Roll back the optimistic flip — never leave the UI showing a state
      // the server didn't actually persist.
      setFavouriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavourited) next.add(locationId);
        else next.delete(locationId);
        return next;
      });
      return result.error === "sign_in_required" ? "sign_in_required" : "error";
    }

    return result.favourited ? "favourited" : "unfavourited";
  }, [signedIn, favouriteIds]);

  return (
    <FavouritesContext.Provider value={{ ready, signedIn, favouriteIds, toggle }}>
      {children}
    </FavouritesContext.Provider>
  );
}

export function useFavourites() {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error("useFavourites must be used within a FavouritesProvider");
  return ctx;
}

"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toggleFavourite as toggleFavouriteAction } from "@/app/(public)/favourites/actions";
import { AuthDialog } from "./auth-dialog";

type ToggleResult = "favourited" | "unfavourited" | "sign_in_required" | "error";

type FavouritesContextValue = {
  /** null while the initial session/favourites check is in flight, so
   * FavouriteButton can avoid flashing an "unfavourited" heart before we
   * actually know. */
  ready: boolean;
  signedIn: boolean;
  favouriteIds: Set<string>;
  toggle: (locationId: string) => Promise<ToggleResult>;
  /** Resolves `true` immediately if already signed in. Otherwise opens the
   * in-page sign-in/sign-up dialog and resolves once the visitor actually
   * signs in (the dialog closes itself via the auth-state listener below,
   * so this always resolves after `signedIn` is already true — no race
   * against the caller retrying its action) or `false` if they close the
   * dialog without signing in. */
  requireAuth: () => Promise<boolean>;
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
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const authResolverRef = useRef<((signedIn: boolean) => void) | null>(null);

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
        // A real sign-in just happened — close the dialog (if open) and
        // tell whoever called requireAuth() they can now proceed. This
        // fires after setSignedIn(true) above, so by the time the caller's
        // promise resolves, signedIn is already true for its next render.
        setAuthDialogOpen(false);
        authResolverRef.current?.(true);
        authResolverRef.current = null;
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

  const requireAuth = useCallback((): Promise<boolean> => {
    if (signedIn) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      authResolverRef.current = resolve;
      setAuthDialogOpen(true);
    });
  }, [signedIn]);

  function handleAuthDialogOpenChange(open: boolean) {
    setAuthDialogOpen(open);
    if (!open) {
      // Closed without signing in (X button, overlay click, Escape) — the
      // auth-state listener above already resolved `true` and cleared the
      // ref for the success case, so a ref still present here means the
      // visitor backed out.
      authResolverRef.current?.(false);
      authResolverRef.current = null;
    }
  }

  return (
    <FavouritesContext.Provider value={{ ready, signedIn, favouriteIds, toggle, requireAuth }}>
      {children}
      <AuthDialog open={authDialogOpen} onOpenChange={handleAuthDialogOpenChange} />
    </FavouritesContext.Provider>
  );
}

export function useFavourites() {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error("useFavourites must be used within a FavouritesProvider");
  return ctx;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** Fired on window when an in-page sign-in creates a session after mount. */
export const AUTH_CHANGED_EVENT = "pb-auth-changed";

/** Cheap browser-side check for a Supabase auth session cookie, so anonymous
 * visitors never download/run the Supabase client just to learn they are
 * signed out. Only a hint — real auth is still verified via getUser(). */
export function hasAuthCookie(): boolean {
  return /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);
}

let clientPromise: Promise<SupabaseClient> | null = null;
let initialUserPromise: Promise<{ id: string } | null> | null = null;

/** Loads the browser Supabase client on demand (separate chunk) and caches
 * the single instance, so every consumer (FavouritesProvider, AccountMenu,
 * AuthDialog) shares one client and one auth-event source. */
export function loadSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import("@/lib/supabase/client").then(({ createClient }) => {
      const client = createClient();
      // Invalidate the cached initial-user read when the signed-in state
      // actually changes, so a remounted consumer (e.g. after a client-side
      // navigation away from and back to a public page) re-reads instead of
      // serving a stale value. TOKEN_REFRESHED and INITIAL_SESSION are
      // deliberately ignored: the user identity is unchanged, and clearing
      // on those would defeat the single initial read this cache exists for.
      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
          initialUserPromise = null;
        }
      });
      return client;
    });
  }
  return clientPromise;
}

/** Shared, first-resolve-wins initial auth read. FavouritesProvider and
 * AccountMenu both mount on every public page and each used to call
 * supabase.auth.getUser() separately, so a signed-in visitor made two
 * /auth/v1/user round trips per page load. Both await this same promise
 * instead, making exactly one. Auth changes after mount still flow through
 * each consumer's own onAuthStateChange listener, so this only dedupes the
 * initial read. */
export function getInitialUser(): Promise<{ id: string } | null> {
  if (!initialUserPromise) {
    initialUserPromise = loadSupabaseClient().then(async (supabase) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user ?? null;
    });
  }
  return initialUserPromise;
}

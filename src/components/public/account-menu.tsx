"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Client-only, same reasoning as FavouritesProvider: whether the viewer is
// signed in can't be read on the server here without forcing every public
// page under this Header into dynamic/cookie-reading rendering.
export function AccountMenu({ light }: { light?: boolean }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) {
        setSignedIn(!!user);
        setReady(true);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setSignedIn(!!session?.user);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const iconButtonClass = cn(
    "flex size-9 items-center justify-center rounded-full border transition-colors",
    light
      ? "border-white/30 text-white hover:bg-white/10"
      : "border-border text-foreground/70 hover:bg-muted",
  );

  if (!ready) return <div className="size-9" aria-hidden="true" />;

  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className={iconButtonClass}>
        <User className="size-4" />
        <span className="sr-only">Sign In</span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={iconButtonClass} />}>
        <User className="size-4" />
        <span className="sr-only">Account</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Favourites now lives in the main nav (see header.tsx), right
            after Map — keeping it here too would be a duplicate entry. */}
        <form action={signOut}>
          <DropdownMenuItem render={<button type="submit" className="w-full text-left" />}>
            Sign Out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

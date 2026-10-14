"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getNavBadgeCounts,
  markNavPageSeen,
  type NavBadgeCounts,
} from "@/app/admin/(shell)/nav-badges-actions";

const POLL_MS = 60_000;

/** Admin sidebar links with a count badge on pages that have something new to
 * act on. Lives in a client component because the shell layout does not
 * re-render between page navigations: counts are refetched on every route
 * change, on tab focus, and every minute. Opening a "new since last visit"
 * page (Users, Photographer Profiles) marks it seen, which clears its badge. */
export function AdminNav({ links, showBadges }: { links: { href: string; label: string }[]; showBadges: boolean }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavBadgeCounts>({});

  const refresh = useCallback(async () => {
    setCounts(await getNavBadgeCounts());
  }, []);

  useEffect(() => {
    if (!showBadges) return;
    let cancelled = false;
    (async () => {
      await markNavPageSeen(pathname);
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, showBadges, refresh]);

  useEffect(() => {
    if (!showBadges) return;
    const interval = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [showBadges, refresh]);

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => {
        const count = counts[link.href] ?? 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            {link.label}
            {count > 0 && (
              <span
                aria-label={`${count} new`}
                className="ml-2 min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-medium text-white"
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

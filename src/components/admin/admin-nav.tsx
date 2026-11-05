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
export function AdminNav({
  sections,
  showBadges,
}: {
  sections: { key: string; label: string; href: string; itemHrefs: string[] }[];
  showBadges: boolean;
}) {
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

  // Longest matching href wins, so /admin/locations/bulk-import does not also
  // light up /admin/locations (and nothing matches the /admin prefix).
  const matches = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const activeKey = sections
    .flatMap((section) => [section.href, ...section.itemHrefs].map((href) => ({ key: section.key, href })))
    .filter((entry) => matches(entry.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key;

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {sections.map((section) => {
        const count = section.itemHrefs.reduce((sum, href) => sum + (counts[href] ?? 0), 0);
        const active = section.key === activeKey;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted hover:text-foreground ${
              active ? "bg-muted font-medium text-foreground" : "text-foreground/80"
            }`}
          >
            {section.label}
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

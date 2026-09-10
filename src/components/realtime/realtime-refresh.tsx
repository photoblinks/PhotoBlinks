"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Subscribes to postgres_changes on `table` and refreshes the current
 * server-rendered route whenever a row changes. Purely a change signal —
 * the actual data always comes from the server component's own query, so
 * RLS (not this filter) is what decides which rows a client can ever see;
 * `filter` just avoids waking this tab up for rows it can't read anyway. */
export function RealtimeRefresh({
  table,
  filter,
}: {
  table: string;
  filter?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let debounceId: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`realtime-refresh:${table}:${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => {
          if (debounceId) clearTimeout(debounceId);
          debounceId = setTimeout(() => router.refresh(), 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
  }, [table, filter, router]);

  return null;
}

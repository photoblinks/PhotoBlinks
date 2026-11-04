"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PhotographerCard } from "@/components/public/photographer-card";
import type { PublicPhotographer } from "@/lib/public-data";

function matches(p: PublicPhotographer, term: string) {
  return [p.studioName, p.displayName, p.city, p.state.name, ...p.services, ...p.languages]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

/** Search + grid for the photographer directory. The full (already scoped)
 * list is rendered on the server, so every card is in the initial HTML for
 * SEO; typing only narrows the visible cards on the client. */
export function PhotographerDirectory({ photographers }: { photographers: PublicPhotographer[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const visible = term ? photographers.filter((p) => matches(p, term)) : photographers;

  return (
    <div>
      <div className="relative z-10 mx-auto -mt-7 max-w-2xl px-4 sm:px-0">
        <div className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lg">
          <Search className="size-5 shrink-0 text-pb-brand" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by studio, name, city, or service…"
            aria-label="Search photographers"
            className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">
          No photographers match &ldquo;{query}&rdquo;. Try a different search.
        </p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((photographer) => (
            <PhotographerCard key={photographer.id} photographer={photographer} />
          ))}
        </div>
      )}
    </div>
  );
}

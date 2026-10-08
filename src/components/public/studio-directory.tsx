"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StudioSearch } from "@/components/public/studio-search";
import { StudioCard } from "@/components/public/studio-card";
import type { PublicStudioCard } from "@/lib/public-data";

type StudioDirectoryProps = {
  mode: "country" | "state" | "city";
  /** Full published-studio set for this page's scope (already narrowed to
   * the fixed country/state/city by the server). */
  studios: PublicStudioCard[];
  basePath: string;
  countrySlug?: string;
  stateSlug?: string;
};

/** Interactive layer for the studio directory pages: reads `?q=` on the
 * client and filters the already-fetched studio list by name, so the route
 * itself stays static/ISR. Rendered inside a Suspense boundary (the server
 * page supplies the canonical fallback). */
export function StudioDirectory({
  mode,
  studios,
  basePath,
  countrySlug,
  stateSlug,
}: StudioDirectoryProps) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.trim() || undefined;
  const search = q?.toLowerCase();
  const filtered = search ? studios.filter((s) => s.name.toLowerCase().includes(search)) : studios;

  return (
    <>
      <StudioSearch basePath={basePath} q={q} />

      {mode === "country" ? (
        <CountryStudioResults studios={filtered} countrySlug={countrySlug!} search={search} q={q} />
      ) : mode === "state" ? (
        <StateStudioResults
          studios={filtered}
          countrySlug={countrySlug!}
          stateSlug={stateSlug!}
          search={search}
          q={q}
        />
      ) : (
        <CityStudioResults studios={filtered} q={q} />
      )}
    </>
  );
}

export function CountryStudioResults({
  studios,
  countrySlug,
  search,
  q,
}: {
  studios: PublicStudioCard[];
  countrySlug: string;
  search?: string;
  q?: string;
}) {
  const stateCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const studio of studios) {
    if (!studio.state) continue;
    const existing = stateCounts.get(studio.state.slug);
    if (existing) existing.count += 1;
    else stateCounts.set(studio.state.slug, { ...studio.state, count: 1 });
  }
  const states = [...stateCounts.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (states.length === 0) {
    return (
      <p className="mt-8 text-muted-foreground">
        No published studios match &ldquo;{q}&rdquo;. Try a different search.
      </p>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {states.map((state) => (
        <Link
          key={state.slug}
          href={`/studios/${countrySlug}/${state.slug}${search ? `?q=${encodeURIComponent(q!)}` : ""}`}
          className="rounded-lg border p-4 transition-shadow hover:shadow-md"
        >
          <h2 className="text-lg font-semibold">{state.name}</h2>
          <p className="text-sm text-muted-foreground">
            {state.count} studio{state.count === 1 ? "" : "s"}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function StateStudioResults({
  studios,
  countrySlug,
  stateSlug,
  search,
  q,
}: {
  studios: PublicStudioCard[];
  countrySlug: string;
  stateSlug: string;
  search?: string;
  q?: string;
}) {
  const cityMap = new Map<string, { name: string; slug: string; count: number }>();
  for (const studio of studios) {
    if (!studio.city) continue;
    const existing = cityMap.get(studio.city.slug);
    if (existing) existing.count += 1;
    else cityMap.set(studio.city.slug, { ...studio.city, count: 1 });
  }
  const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {cities.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {cities.map((city) => (
            <Link
              key={city.slug}
              href={`/studios/${countrySlug}/${stateSlug}/${city.slug}${search ? `?q=${encodeURIComponent(q!)}` : ""}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {city.name} ({city.count})
            </Link>
          ))}
        </div>
      )}

      {studios.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          No published studios match &ldquo;{q}&rdquo;. Try a different search.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {studios.map((studio) => (
            <StudioCard key={studio.id} studio={studio} />
          ))}
        </div>
      )}
    </>
  );
}

export function CityStudioResults({ studios, q }: { studios: PublicStudioCard[]; q?: string }) {
  if (studios.length === 0) {
    return (
      <p className="mt-8 text-muted-foreground">
        No published studios match &ldquo;{q}&rdquo;. Try a different search.
      </p>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {studios.map((studio) => (
        <StudioCard key={studio.id} studio={studio} />
      ))}
    </div>
  );
}

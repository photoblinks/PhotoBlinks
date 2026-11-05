"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpDown, BadgeCheck, Building2, ChevronLeft, ChevronRight, Globe2, MapPin } from "lucide-react";
import { PhotographerCard } from "@/components/public/photographer-card";
import { FIELD_TRIGGER_CLASS, FilterFieldText } from "@/components/public/home-filter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { haversineDistanceKm } from "@/lib/geo";
import type { PublicPhotographer } from "@/lib/public-data";

const ALL = "all";
const PAGE_SIZE = 20;
const DEFAULT_COUNTRY = "india";

const SORTS = [
  { value: "popularity", label: "Popularity" },
  { value: "price-asc", label: "Price -- Low to High" },
  { value: "price-desc", label: "Price -- High to Low" },
  { value: "newest", label: "Newest First" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

type Coords = { lat: number; lng: number };

function sortPhotographers(list: PublicPhotographer[], sort: SortValue) {
  const byPrice = (dir: 1 | -1) => (a: PublicPhotographer, b: PublicPhotographer) => {
    // Photographers without a package price always sort last.
    if (a.startingPrice == null) return b.startingPrice == null ? 0 : 1;
    if (b.startingPrice == null) return -1;
    return (a.startingPrice - b.startingPrice) * dir;
  };
  const newest = (a: PublicPhotographer, b: PublicPhotographer) => b.createdAt.localeCompare(a.createdAt);
  const sorted = [...list];
  if (sort === "price-asc") sorted.sort(byPrice(1));
  else if (sort === "price-desc") sorted.sort(byPrice(-1));
  else if (sort === "popularity") {
    // No view/lead tracking exists yet, so popularity is approximated by
    // trust signals: verified first, then years of experience, then newest.
    sorted.sort(
      (a, b) =>
        Number(b.isVerified) - Number(a.isVerified) ||
        (b.experienceYears ?? -1) - (a.experienceYears ?? -1) ||
        newest(a, b),
    );
  } else sorted.sort(newest);
  return sorted;
}

function FilterCell({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2 sm:px-4">
      <Icon className="size-4 shrink-0 text-pb-brand" />
      {children}
    </div>
  );
}

/** Page numbers to show: always first/last, the current page and its
 * neighbours, with "…" for gaps. */
function pageList(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ["gap" as const, n] : [n]));
}

/** Filters + sort + paginated grid for the photographer directory, styled
 * like the home page filter. The full (already scoped) list is passed from
 * the server; the filters only narrow/reorder it on the client, 20 per page. */
export function PhotographerDirectoryClient({
  photographers,
  cityCoords,
}: {
  photographers: PublicPhotographer[];
  cityCoords: Record<string, Coords>;
}) {
  const defaultCountry = photographers.some((p) => p.country.slug === DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : ALL;

  const [country, setCountry] = useState(defaultCountry);
  const [state, setState] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [verifiedOnly, setVerifiedOnly] = useState(ALL);
  const [sort, setSort] = useState<SortValue>("popularity");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Ignores a slow geolocation callback that resolves after the user has
  // turned Near by off or reset the filters.
  const locationRequestIdRef = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Page resets to 1 whenever any filter or the sort changes: the stored page
  // only counts while it belongs to the current filter combination.
  const filterKey = [country, state, city, verifiedOnly, sort, coords ? "near" : ""].join("|");
  const [pageInfo, setPageInfo] = useState({ key: filterKey, page: 1 });
  const requestedPage = pageInfo.key === filterKey ? pageInfo.page : 1;

  const options = useMemo(() => {
    const countries = new Map<string, string>();
    const states = new Map<string, string>();
    const cities = new Map<string, string>();
    for (const p of photographers) {
      countries.set(p.country.slug, p.country.name);
      if (country === ALL || p.country.slug === country) states.set(p.state.slug, p.state.name);
      if ((country === ALL || p.country.slug === country) && (state === ALL || p.state.slug === state)) {
        cities.set(p.citySlug, p.city);
      }
    }
    const sorted = (map: Map<string, string>) => [...map].sort((a, b) => a[1].localeCompare(b[1]));
    return { countries: sorted(countries), states: sorted(states), cities: sorted(cities) };
  }, [photographers, country, state]);

  const visible = useMemo(() => {
    const filtered = photographers.filter(
      (p) =>
        (country === ALL || p.country.slug === country) &&
        (state === ALL || p.state.slug === state) &&
        (city === ALL || p.citySlug === city) &&
        (verifiedOnly === ALL || p.isVerified),
    );
    if (!coords) return sortPhotographers(filtered, sort);

    // Near by: nearest city first. Photographers whose city has no known
    // position go last.
    const distance = (p: PublicPhotographer) => {
      const at = cityCoords[`${p.state.slug}/${p.citySlug}`];
      return at
        ? haversineDistanceKm({ latitude: coords.lat, longitude: coords.lng }, { latitude: at.lat, longitude: at.lng })
        : Infinity;
    };
    return filtered
      .map((p) => ({ p, d: distance(p) }))
      .sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1))
      .map(({ p }) => p);
  }, [photographers, country, state, city, verifiedOnly, sort, coords, cityCoords]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isFiltered =
    country !== defaultCountry || state !== ALL || city !== ALL || verifiedOnly !== ALL || sort !== "popularity" || coords !== null;

  function goToPage(next: number) {
    setPageInfo({ key: filterKey, page: next });
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reset() {
    locationRequestIdRef.current += 1;
    setCountry(defaultCountry);
    setState(ALL);
    setCity(ALL);
    setVerifiedOnly(ALL);
    setSort("popularity");
    setCoords(null);
    setLocating(false);
    setLocationError(null);
  }

  function handleNearByChange(checked: boolean) {
    setLocationError(null);
    locationRequestIdRef.current += 1;
    if (!checked) {
      setCoords(null);
      setLocating(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location isn't available in this browser.");
      return;
    }
    const requestId = locationRequestIdRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestIdRef.current) return;
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        if (requestId !== locationRequestIdRef.current) return;
        setLocating(false);
        setLocationError("Location permission was denied.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  const countryName = options.countries.find(([slug]) => slug === country)?.[1];
  const stateName = options.states.find(([slug]) => slug === state)?.[1];
  const cityName = options.cities.find(([slug]) => slug === city)?.[1];

  return (
    <div>
      <div className="relative z-10 mx-auto -mt-7 max-w-6xl px-4 sm:px-0">
        <div className="flex flex-col gap-1 rounded-2xl bg-white p-3 shadow-xl lg:flex-row lg:items-center lg:gap-0 lg:divide-x lg:divide-border">
          <FilterCell icon={MapPin}>
            <Select
              value={state}
              onValueChange={(v) => {
                setState(v ?? ALL);
                setCity(ALL);
              }}
            >
              <SelectTrigger className={FIELD_TRIGGER_CLASS} aria-label="State">
                <FilterFieldText label="State" mobilePlaceholder="State" desktopPlaceholder="Any state" value={stateName} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any state</SelectItem>
                {options.states.map(([slug, name]) => (
                  <SelectItem key={slug} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          <FilterCell icon={Building2}>
            <Select value={city} onValueChange={(v) => setCity(v ?? ALL)}>
              <SelectTrigger className={FIELD_TRIGGER_CLASS} aria-label="City">
                <FilterFieldText label="City" mobilePlaceholder="City" desktopPlaceholder="Any city" value={cityName} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any city</SelectItem>
                {options.cities.map(([slug, name]) => (
                  <SelectItem key={slug} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          <FilterCell icon={Globe2}>
            <Select
              value={country}
              onValueChange={(v) => {
                setCountry(v ?? ALL);
                setState(ALL);
                setCity(ALL);
              }}
            >
              <SelectTrigger className={FIELD_TRIGGER_CLASS} aria-label="Country">
                <FilterFieldText label="Country" mobilePlaceholder="Country" desktopPlaceholder="Any country" value={countryName} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any country</SelectItem>
                {options.countries.map(([slug, name]) => (
                  <SelectItem key={slug} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCell>

          <FilterCell icon={BadgeCheck}>
            <Select value={verifiedOnly} onValueChange={(v) => setVerifiedOnly(v ?? ALL)}>
              <SelectTrigger className={FIELD_TRIGGER_CLASS} aria-label="Verified">
                <FilterFieldText
                  label="Verified"
                  mobilePlaceholder="Verified"
                  desktopPlaceholder="All photographers"
                  value={verifiedOnly === ALL ? undefined : "Verified only"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All photographers</SelectItem>
                <SelectItem value="verified">Verified only</SelectItem>
              </SelectContent>
            </Select>
          </FilterCell>

          <div className="flex shrink-0 flex-col justify-center gap-1 py-2 sm:px-4">
            <label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
              <Switch checked={coords !== null} onCheckedChange={handleNearByChange} disabled={locating} />
              {locating ? "Locating…" : "Near by"}
            </label>
            {locationError && <p className="text-xs text-destructive">{locationError}</p>}
          </div>
        </div>
      </div>

      <div ref={gridRef} className="mt-6 flex scroll-mt-24 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {visible.length} photographer{visible.length === 1 ? "" : "s"}
          {coords && " · nearest first (by city, approximate)"}
        </p>
        <Select value={sort} onValueChange={(v) => setSort((v ?? "popularity") as SortValue)} disabled={coords !== null}>
          <SelectTrigger className="h-10 w-full rounded-xl bg-white px-3 sm:w-auto" aria-label="Sort by">
            <ArrowUpDown className="size-4 text-pb-brand" />
            <span className="text-muted-foreground">Sort by:</span>
            <span className="font-semibold">{SORTS.find((o) => o.value === sort)?.label}</span>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">No photographers match these filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageItems.map((photographer) => (
            <PhotographerCard key={photographer.id} photographer={photographer} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1.5">
          <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => goToPage(page - 1)}>
            <ChevronLeft className="size-4" /> Prev
          </Button>
          {pageList(page, pageCount).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={entry}
                type="button"
                size="sm"
                variant={entry === page ? "default" : "outline"}
                aria-current={entry === page ? "page" : undefined}
                onClick={() => goToPage(entry)}
              >
                {entry}
              </Button>
            ),
          )}
          <Button type="button" variant="outline" size="sm" disabled={page === pageCount} onClick={() => goToPage(page + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}

      {isFiltered && (
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" onClick={reset}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}

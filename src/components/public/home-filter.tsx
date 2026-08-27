"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Building2, LayoutGrid, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; slug: string };
type City = Option & { state_id: string };

const ALL = "all";

const FIELD_TRIGGER_CLASS =
  "h-auto w-full justify-start gap-0 border-0 bg-transparent p-0 text-sm font-medium shadow-none hover:bg-transparent data-placeholder:text-muted-foreground";

const PRICING_LABELS: Record<string, string> = { free: "Free", paid: "Paid", unknown: "Unknown" };

/** Trigger content for one filter field: a caption + value on desktop
 * (two lines), collapsed to a single line on mobile — just the field's
 * label until something is picked, then the picked value. */
function FilterFieldText({
  label,
  mobilePlaceholder,
  desktopPlaceholder,
  value,
}: {
  label: string;
  mobilePlaceholder: string;
  desktopPlaceholder: string;
  value?: string;
}) {
  return (
    <span className="flex flex-1 flex-col gap-0.5 overflow-hidden text-left">
      <span className="hidden text-[0.7rem] font-semibold text-muted-foreground sm:block">
        {label}
      </span>
      <span className="truncate text-sm font-medium">
        <span className="sm:hidden">{value ?? mobilePlaceholder}</span>
        <span className="hidden sm:inline">{value ?? desktopPlaceholder}</span>
      </span>
    </span>
  );
}

export function HomeFilter({
  states,
  cities,
  categories,
  initial,
  basePath = "/",
  className,
  hideState = false,
  hideCity = false,
  hideCategory = false,
}: {
  states: Option[];
  cities: City[];
  categories: Option[];
  initial: { state?: string; city?: string; category?: string; pricing?: string; lat?: string; lng?: string };
  basePath?: string;
  className?: string;
  /** Hide the State field — for a page already scoped to one state or city
   * (e.g. a state or city SEO landing page), where it would be redundant.
   * `initial.state` should still be set so the (hidden) state stays fixed
   * and the City field, if shown, filters to cities within it. */
  hideState?: boolean;
  /** Hide the City field — for a page already scoped to one city. */
  hideCity?: boolean;
  /** Hide the Category field — for a page that's already scoped to one
   * category (e.g. /category/[slug]), where it would be redundant. */
  hideCategory?: boolean;
}) {
  const router = useRouter();

  const initialState = states.find((s) => s.slug === initial.state);
  const initialCity = cities.find((c) => c.slug === initial.city);

  const [stateId, setStateId] = useState(initialState?.id ?? ALL);
  const [cityId, setCityId] = useState(initialCity?.id ?? ALL);
  const [categorySlug, setCategorySlug] = useState(initial.category ?? ALL);
  const [pricing, setPricing] = useState(initial.pricing ?? ALL);
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(
    initial.lat && initial.lng ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Guards against a getCurrentPosition callback resolving after the user
  // has since reset the form, disabled location, or started a newer
  // request — without this a slow/stale callback could resurrect old
  // coordinates and navigate away from wherever the user just went.
  const locationRequestIdRef = useRef(0);

  const citiesForState = cities.filter((c) => c.state_id === stateId);

  const selectedStateName = stateId !== ALL ? states.find((s) => s.id === stateId)?.name : undefined;
  const selectedCityName = cityId !== ALL ? cities.find((c) => c.id === cityId)?.name : undefined;
  const selectedCategoryName =
    categorySlug !== ALL ? categories.find((c) => c.slug === categorySlug)?.name : undefined;
  const selectedPricingName = pricing !== ALL ? PRICING_LABELS[pricing] : undefined;

  const isFiltered =
    (!hideState && stateId !== ALL) ||
    (!hideCity && cityId !== ALL) ||
    (!hideCategory && categorySlug !== ALL) ||
    pricing !== ALL ||
    coords !== null;

  function handleReset() {
    locationRequestIdRef.current += 1;
    // Fixed geography (hidden fields) stays put — only the fields the user
    // can actually see and adjust get cleared.
    if (!hideState) setStateId(ALL);
    if (!hideCity) setCityId(ALL);
    if (!hideCategory) setCategorySlug(ALL);
    setPricing(ALL);
    setCoords(null);
    setLocationError(null);
    router.push(basePath);
  }

  function handleStateChange(value: string) {
    setStateId(value);
    if (!cities.some((c) => c.id === cityId && c.state_id === value)) {
      setCityId(ALL);
    }
  }

  function buildParams(overrideCoords?: { lat: string; lng: string } | null) {
    const params = new URLSearchParams();
    const stateSlug = states.find((s) => s.id === stateId)?.slug;
    const citySlug = cities.find((c) => c.id === cityId)?.slug;
    if (!hideState && stateSlug) params.set("state", stateSlug);
    if (!hideCity && citySlug) params.set("city", citySlug);
    if (!hideCategory && categorySlug !== ALL) params.set("category", categorySlug);
    if (pricing !== ALL) params.set("pricing", pricing);
    const effectiveCoords = overrideCoords === undefined ? coords : overrideCoords;
    if (effectiveCoords) {
      params.set("lat", effectiveCoords.lat);
      params.set("lng", effectiveCoords.lng);
    }
    return params;
  }

  function navigate(params: URLSearchParams) {
    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    navigate(buildParams());
  }

  function handleNearMeChange(checked: boolean) {
    setLocationError(null);

    if (!checked) {
      locationRequestIdRef.current += 1;
      setCoords(null);
      navigate(buildParams(null));
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location isn't available in this browser.");
      return;
    }

    locationRequestIdRef.current += 1;
    const requestId = locationRequestIdRef.current;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestIdRef.current) return;
        const next = {
          lat: position.coords.latitude.toString(),
          lng: position.coords.longitude.toString(),
        };
        setCoords(next);
        setLocating(false);
        navigate(buildParams(next));
      },
      () => {
        if (requestId !== locationRequestIdRef.current) return;
        setLocating(false);
        setLocationError("Location permission was denied.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl sm:flex-row sm:items-stretch sm:gap-0 sm:divide-x sm:divide-border sm:p-3",
        className,
      )}
    >
      {!hideState && (
        <div className="flex flex-1 items-center gap-2.5 py-1.5 sm:px-4 sm:py-4">
          <MapPin className="size-4 shrink-0 text-pb-brand" />
          <Select value={stateId} onValueChange={(value) => handleStateChange(value ?? ALL)}>
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <FilterFieldText
                label="State"
                mobilePlaceholder="State"
                desktopPlaceholder="Where to?"
                value={selectedStateName}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any state</SelectItem>
              {states.map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!hideCity && (
        <div className="flex flex-1 items-center gap-2.5 py-1.5 sm:px-4 sm:py-4">
          <Building2 className="size-4 shrink-0 text-pb-brand" />
          <Select
            value={cityId}
            onValueChange={(value) => setCityId(value ?? ALL)}
            disabled={stateId === ALL}
          >
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <FilterFieldText
                label="City"
                mobilePlaceholder="City"
                desktopPlaceholder="Any city"
                value={selectedCityName}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any city</SelectItem>
              {citiesForState.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!hideCategory && (
        <div className="flex flex-1 items-center gap-2.5 py-1.5 sm:px-4 sm:py-4">
          <LayoutGrid className="size-4 shrink-0 text-pb-brand" />
          <Select value={categorySlug} onValueChange={(value) => setCategorySlug(value ?? ALL)}>
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <FilterFieldText
                label="Category"
                mobilePlaceholder="Category"
                desktopPlaceholder="All categories"
                value={selectedCategoryName}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.slug}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-1 items-center gap-2.5 py-1.5 sm:px-4 sm:py-4">
        <Tag className="size-4 shrink-0 text-pb-brand" />
        <Select value={pricing} onValueChange={(value) => setPricing(value ?? ALL)}>
          <SelectTrigger className={FIELD_TRIGGER_CLASS}>
            <FilterFieldText
              label="Pricing"
              mobilePlaceholder="Pricing"
              desktopPlaceholder="Any budget"
              value={selectedPricingName}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any budget</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col justify-center gap-1 sm:px-4">
        <label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
          <Switch
            checked={coords != null}
            onCheckedChange={handleNearMeChange}
            disabled={locating}
          />
          My Location
        </label>
        {locationError && <p className="text-xs text-destructive">{locationError}</p>}
      </div>

      <div className="flex flex-col items-stretch justify-center gap-2 pt-1 sm:pt-0 sm:pl-3">
        <Button type="submit" className="w-full sm:w-auto" disabled={locating}>
          {locating ? "Locating…" : "Explore"}
        </Button>
        {isFiltered && (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleReset}
          >
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

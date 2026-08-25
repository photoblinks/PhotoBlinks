"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Building2, LayoutGrid, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string; slug: string };
type City = Option & { state_id: string };

const ALL = "all";

const FIELD_TRIGGER_CLASS =
  "h-auto w-full justify-start gap-0 border-0 bg-transparent p-0 text-sm font-medium shadow-none hover:bg-transparent data-placeholder:text-muted-foreground";

export function HomeFilter({
  states,
  cities,
  categories,
  initial,
  basePath = "/",
}: {
  states: Option[];
  cities: City[];
  categories: Option[];
  initial: { state?: string; city?: string; category?: string; pricing?: string; lat?: string; lng?: string };
  basePath?: string;
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

  const citiesForState = cities.filter((c) => c.state_id === stateId);

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
    if (stateSlug) params.set("state", stateSlug);
    if (citySlug) params.set("city", citySlug);
    if (categorySlug !== ALL) params.set("category", categorySlug);
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
      setCoords(null);
      navigate(buildParams(null));
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location isn't available in this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude.toString(),
          lng: position.coords.longitude.toString(),
        };
        setCoords(next);
        setLocating(false);
        navigate(buildParams(next));
      },
      () => {
        setLocating(false);
        setLocationError("Location permission was denied.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl sm:flex-row sm:items-stretch sm:gap-0 sm:divide-x sm:divide-border sm:p-3"
    >
      <div className="flex flex-1 items-center gap-2.5 sm:px-4">
        <MapPin className="size-4 shrink-0 text-pb-brand" />
        <div className="flex w-full flex-col gap-0.5">
          <span className="text-[0.7rem] font-semibold text-muted-foreground">State</span>
          <Select value={stateId} onValueChange={(value) => handleStateChange(value ?? ALL)}>
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <SelectValue placeholder="Where to?" />
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
      </div>

      <div className="flex flex-1 items-center gap-2.5 sm:px-4">
        <Building2 className="size-4 shrink-0 text-pb-brand" />
        <div className="flex w-full flex-col gap-0.5">
          <span className="text-[0.7rem] font-semibold text-muted-foreground">City</span>
          <Select
            value={cityId}
            onValueChange={(value) => setCityId(value ?? ALL)}
            disabled={stateId === ALL}
          >
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <SelectValue placeholder="Any city" />
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
      </div>

      <div className="flex flex-1 items-center gap-2.5 sm:px-4">
        <LayoutGrid className="size-4 shrink-0 text-pb-brand" />
        <div className="flex w-full flex-col gap-0.5">
          <span className="text-[0.7rem] font-semibold text-muted-foreground">Category</span>
          <Select value={categorySlug} onValueChange={(value) => setCategorySlug(value ?? ALL)}>
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <SelectValue placeholder="All categories" />
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
      </div>

      <div className="flex flex-1 items-center gap-2.5 sm:px-4">
        <Tag className="size-4 shrink-0 text-pb-brand" />
        <div className="flex w-full flex-col gap-0.5">
          <span className="text-[0.7rem] font-semibold text-muted-foreground">Pricing</span>
          <Select value={pricing} onValueChange={(value) => setPricing(value ?? ALL)}>
            <SelectTrigger className={FIELD_TRIGGER_CLASS}>
              <SelectValue placeholder="Any budget" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any budget</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      <div className="flex items-center pt-1 sm:pt-0 sm:pl-3">
        <Button type="submit" className="w-full sm:w-auto" disabled={locating}>
          {locating ? "Locating…" : "Explore"}
        </Button>
      </div>
    </form>
  );
}

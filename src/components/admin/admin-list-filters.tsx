"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };
type StateOption = Option & { country_id: string };
type CityOption = Option & { state_id: string };

const ALL = "all";

/** Search + Country/State/City (+ optional Category) filter bar for the
 * admin Locations and Studios list pages. Cascading like the Country →
 * State → City fields in GeoSelector: picking a country narrows the state
 * options, picking a state narrows the city options. Submitting navigates
 * to `basePath` with the picked values as query params; the list pages
 * read those server-side and filter the Supabase query. */
export function AdminListFilters({
  basePath,
  countries,
  states,
  cities,
  categories,
  initial,
}: {
  basePath: string;
  countries: Option[];
  states: StateOption[];
  cities: CityOption[];
  categories?: Option[];
  initial: { q?: string; country?: string; state?: string; city?: string; category?: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q ?? "");
  const [countryId, setCountryId] = useState(initial.country ?? ALL);
  const [stateId, setStateId] = useState(initial.state ?? ALL);
  const [cityId, setCityId] = useState(initial.city ?? ALL);
  const [categoryId, setCategoryId] = useState(initial.category ?? ALL);

  const statesForCountry = states.filter((s) => countryId === ALL || s.country_id === countryId);
  const citiesForState = cities.filter((c) => stateId === ALL || c.state_id === stateId);

  const isFiltered =
    q.trim() !== "" ||
    countryId !== ALL ||
    stateId !== ALL ||
    cityId !== ALL ||
    (categories !== undefined && categoryId !== ALL);

  function handleCountryChange(value: string) {
    setCountryId(value);
    setStateId(ALL);
    setCityId(ALL);
  }

  function handleStateChange(value: string) {
    setStateId(value);
    setCityId(ALL);
  }

  function navigate() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (countryId !== ALL) params.set("country", countryId);
    if (stateId !== ALL) params.set("state", stateId);
    if (cityId !== ALL) params.set("city", cityId);
    if (categories !== undefined && categoryId !== ALL) params.set("category", categoryId);
    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    navigate();
  }

  function handleReset() {
    setQ("");
    setCountryId(ALL);
    setStateId(ALL);
    setCityId(ALL);
    setCategoryId(ALL);
    router.push(basePath);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" />
      </div>

      <div className="flex w-40 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Country</span>
        <Select
          items={[{ value: ALL, label: "All countries" }, ...countries.map((c) => ({ value: c.id, label: c.name }))]}
          value={countryId}
          onValueChange={(value) => handleCountryChange(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All countries</SelectItem>
            {countries.map((country) => (
              <SelectItem key={country.id} value={country.id}>
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-40 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">State</span>
        <Select
          items={[{ value: ALL, label: "All states" }, ...statesForCountry.map((s) => ({ value: s.id, label: s.name }))]}
          value={stateId}
          onValueChange={(value) => handleStateChange(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {statesForCountry.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-40 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">City</span>
        <Select
          items={[{ value: ALL, label: "All cities" }, ...citiesForState.map((c) => ({ value: c.id, label: c.name }))]}
          value={cityId}
          onValueChange={(value) => setCityId(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cities</SelectItem>
            {citiesForState.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {categories !== undefined && (
        <div className="flex w-40 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <Select
            items={[{ value: ALL, label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            value={categoryId}
            onValueChange={(value) => setCategoryId(String(value))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        {isFiltered && (
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

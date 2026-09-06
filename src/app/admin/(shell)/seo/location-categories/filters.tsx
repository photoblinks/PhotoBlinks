"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { slug: string; name: string };
type StateOption = Option & { countrySlug: string };
type CityOption = Option & { stateSlug: string };

const ALL = "all";

/** Country/State/City/Category filters for the Location + Category SEO
 * inventory. State narrows City, same cascading pattern as the public
 * HomeFilter. Only offers values that actually appear in the inventory
 * (no separate query — passed down from the already-computed rows). */
export function LocationCategoryFilters({
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
  categories: Option[];
  initial: { q?: string; country?: string; state?: string; city?: string; category?: string };
}) {
  const router = useRouter();

  const statesForCountry = initial.country
    ? states.filter((s) => s.countrySlug === initial.country)
    : states;
  const citiesForState = initial.state
    ? cities.filter((c) => c.stateSlug === initial.state)
    : cities;

  function navigate(next: { country?: string; state?: string; city?: string; category?: string }) {
    const params = new URLSearchParams();
    if (initial.q) params.set("q", initial.q);

    const country = "country" in next ? next.country : initial.country;
    const state = "state" in next ? next.state : initial.state;
    const city = "city" in next ? next.city : initial.city;
    const category = "category" in next ? next.category : initial.category;

    if (country) params.set("country", country);
    if (state) params.set("state", state);
    if (city) params.set("city", city);
    if (category) params.set("category", category);

    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={initial.country ?? ALL}
        onValueChange={(value) =>
          navigate({ country: value === ALL ? undefined : (value ?? undefined), state: undefined, city: undefined })
        }
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All countries</SelectItem>
          {countries.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initial.state ?? ALL}
        onValueChange={(value) =>
          navigate({ state: value === ALL ? undefined : (value ?? undefined), city: undefined })
        }
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All states</SelectItem>
          {statesForCountry.map((s) => (
            <SelectItem key={s.slug} value={s.slug}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initial.city ?? ALL}
        onValueChange={(value) => navigate({ city: value === ALL ? undefined : (value ?? undefined) })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="City" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All cities</SelectItem>
          {citiesForState.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initial.category ?? ALL}
        onValueChange={(value) =>
          navigate({ category: value === ALL ? undefined : (value ?? undefined) })
        }
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

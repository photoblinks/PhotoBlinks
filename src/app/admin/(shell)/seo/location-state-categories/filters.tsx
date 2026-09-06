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

const ALL = "all";

/** Country/State/Category filters for the State + Category SEO inventory —
 * mirrors LocationCategoryFilters one geo level up (no City dimension). */
export function LocationStateCategoryFilters({
  basePath,
  countries,
  states,
  categories,
  initial,
}: {
  basePath: string;
  countries: Option[];
  states: StateOption[];
  categories: Option[];
  initial: { q?: string; country?: string; state?: string; category?: string };
}) {
  const router = useRouter();

  const statesForCountry = initial.country
    ? states.filter((s) => s.countrySlug === initial.country)
    : states;

  function navigate(next: { country?: string; state?: string; category?: string }) {
    const params = new URLSearchParams();
    if (initial.q) params.set("q", initial.q);

    const country = "country" in next ? next.country : initial.country;
    const state = "state" in next ? next.state : initial.state;
    const category = "category" in next ? next.category : initial.category;

    if (country) params.set("country", country);
    if (state) params.set("state", state);
    if (category) params.set("category", category);

    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={initial.country ?? ALL}
        onValueChange={(value) =>
          navigate({ country: value === ALL ? undefined : (value ?? undefined), state: undefined })
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
        onValueChange={(value) => navigate({ state: value === ALL ? undefined : (value ?? undefined) })}
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

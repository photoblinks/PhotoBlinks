"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Building2, LayoutGrid, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  initial: { state?: string; city?: string; category?: string; pricing?: string };
  basePath?: string;
}) {
  const router = useRouter();

  const initialState = states.find((s) => s.slug === initial.state);
  const initialCity = cities.find((c) => c.slug === initial.city);

  const [stateId, setStateId] = useState(initialState?.id ?? ALL);
  const [cityId, setCityId] = useState(initialCity?.id ?? ALL);
  const [categorySlug, setCategorySlug] = useState(initial.category ?? ALL);
  const [pricing, setPricing] = useState(initial.pricing ?? ALL);

  const citiesForState = cities.filter((c) => c.state_id === stateId);

  function handleStateChange(value: string) {
    setStateId(value);
    if (!cities.some((c) => c.id === cityId && c.state_id === value)) {
      setCityId(ALL);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    const stateSlug = states.find((s) => s.id === stateId)?.slug;
    const citySlug = cities.find((c) => c.id === cityId)?.slug;
    if (stateSlug) params.set("state", stateSlug);
    if (citySlug) params.set("city", citySlug);
    if (categorySlug !== ALL) params.set("category", categorySlug);
    if (pricing !== ALL) params.set("pricing", pricing);
    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl sm:flex-row sm:items-stretch sm:gap-0 sm:divide-x sm:divide-border sm:p-3"
    >
      <div className="flex flex-1 items-center gap-2.5 sm:px-4">
        <MapPin className="size-4 shrink-0 text-pb-brand" />
        <div className="flex w-full flex-col gap-0.5">
          <span className="text-[0.7rem] text-muted-foreground">State</span>
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
          <span className="text-[0.7rem] text-muted-foreground">City</span>
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
          <span className="text-[0.7rem] text-muted-foreground">Category</span>
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
          <span className="text-[0.7rem] text-muted-foreground">Pricing</span>
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

      <div className="flex items-center pt-1 sm:pt-0 sm:pl-3">
        <Button type="submit" className="w-full sm:w-auto">
          Explore
        </Button>
      </div>
    </form>
  );
}

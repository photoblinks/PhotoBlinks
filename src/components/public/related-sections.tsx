import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import {
  getActiveCities,
  getActiveStates,
  getPublicPhotographers,
  getPublishedLocations,
  getPublishedStudios,
  type PublicLocationCard,
} from "@/lib/public-data";
import { LocationCard } from "@/components/public/location-card";
import { PhotographerCard } from "@/components/public/photographer-card";

const CARD_LIMIT = 4;
const GRID = "grid grid-cols-2 gap-4 lg:grid-cols-4";

type Section = "locations" | "studios";

type PlaceCard = {
  href: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  count: number;
  /** 2 = same parent (state for cities, country for states), 1 = same country, 0 = elsewhere. */
  score: number;
};

function PlaceCards({ title, places, section }: { title: string; places: PlaceCard[]; section: Section }) {
  if (places.length === 0) return null;
  const noun = section === "studios" ? "studio" : "location";

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-heading mb-4 text-2xl font-semibold">{title}</h2>
      <div className={GRID}>
        {places.map((place) => (
          <Link
            key={place.href}
            href={place.href}
            className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative aspect-4/3 overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800">
              {place.imageUrl && (
                <Image
                  src={place.imageUrl}
                  alt={place.name}
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex flex-col gap-1 p-4">
              <h3 className="font-heading text-lg leading-snug font-semibold text-foreground">{place.name}</h3>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0 text-pb-brand" />
                {place.subtitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {place.count.toLocaleString("en-IN")} {noun}
                {place.count === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** 4 photographers: the page's city first, then the rest of its state. Renders
 * nothing when none are visible. */
async function PhotographerCards({
  placeName,
  stateSlug,
  citySlug,
}: {
  placeName: string;
  stateSlug: string;
  citySlug?: string;
}) {
  const inState = (await getPublicPhotographers()).filter((p) => p.state.slug === stateSlug);
  const photographers = [
    ...inState.filter((p) => citySlug && p.citySlug === citySlug),
    ...inState.filter((p) => !citySlug || p.citySlug !== citySlug),
  ].slice(0, CARD_LIMIT);
  if (photographers.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-heading mb-4 text-2xl font-semibold">Pre-wedding photographers near {placeName}</h2>
      <div className={GRID}>
        {photographers.map((photographer) => (
          <PhotographerCard key={photographer.id} photographer={photographer} />
        ))}
      </div>
    </section>
  );
}

async function getGeoCounts(section: Section) {
  const items = section === "studios" ? await getPublishedStudios() : await getPublishedLocations();
  const states = new Map<string, number>();
  const cities = new Map<string, number>();
  for (const { state, city } of items) {
    if (!state) continue;
    states.set(state.slug, (states.get(state.slug) ?? 0) + 1);
    if (city) cities.set(`${state.slug}/${city.slug}`, (cities.get(`${state.slug}/${city.slug}`) ?? 0) + 1);
  }
  return { states, cities };
}

function topPlaces(places: PlaceCard[]) {
  return places
    .sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, CARD_LIMIT);
}

/** Interlinking block for city and state pages: 4 other city (or state)
 * cards, then 4 photographer cards. Each part hides itself when empty. */
export async function RelatedPlaces({
  level,
  section,
  countrySlug,
  stateSlug,
  citySlug,
  placeName,
}: {
  level: "city" | "state";
  section: Section;
  countrySlug: string;
  stateSlug: string;
  citySlug?: string;
  placeName: string;
}) {
  const [states, counts] = await Promise.all([getActiveStates(), getGeoCounts(section)]);

  let places: PlaceCard[];
  if (level === "city") {
    const stateById = new Map(states.map((s) => [s.id, s]));
    places = (await getActiveCities()).flatMap((city) => {
      const state = stateById.get(city.state_id);
      const count = state ? (counts.cities.get(`${state.slug}/${city.slug}`) ?? 0) : 0;
      if (!state?.country || count === 0 || (state.slug === stateSlug && city.slug === citySlug)) return [];
      return [
        {
          href: `/${section}/${state.country.slug}/${state.slug}/${city.slug}`,
          name: city.name,
          subtitle: state.name,
          imageUrl: city.image_url,
          count,
          score: state.slug === stateSlug ? 2 : state.country.slug === countrySlug ? 1 : 0,
        },
      ];
    });
  } else {
    places = states.flatMap((state) => {
      const count = counts.states.get(state.slug) ?? 0;
      if (!state.country || count === 0 || state.slug === stateSlug) return [];
      return [
        {
          href: `/${section}/${state.country.slug}/${state.slug}`,
          name: state.name,
          subtitle: state.country.name,
          imageUrl: state.image_url,
          count,
          score: state.country.slug === countrySlug ? 2 : 0,
        },
      ];
    });
  }

  return (
    <>
      <PlaceCards
        title={level === "city" ? "Explore more cities" : "Explore more states"}
        places={topPlaces(places)}
        section={section}
      />
      <PhotographerCards placeName={placeName} stateSlug={stateSlug} citySlug={citySlug} />
    </>
  );
}

/** Interlinking block for a location detail page: 4 other locations (same
 * city first, then same state, then anywhere), then 4 photographers. */
export async function RelatedLocations({
  locationSlug,
  stateSlug,
  citySlug,
  placeName,
}: {
  locationSlug: string;
  stateSlug?: string;
  citySlug?: string;
  placeName: string;
}) {
  const score = (l: PublicLocationCard) =>
    l.state?.slug === stateSlug && l.city?.slug === citySlug ? 2 : l.state?.slug === stateSlug ? 1 : 0;
  const related = (await getPublishedLocations())
    .filter((l) => l.slug !== locationSlug)
    .map((l) => ({ l, score: score(l) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CARD_LIMIT);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      {related.length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="font-heading mb-4 text-2xl font-semibold">More locations to explore</h2>
          <div className={GRID}>
            {related.map(({ l }) => (
              <LocationCard key={l.id} location={l} />
            ))}
          </div>
        </section>
      )}
      {stateSlug && <PhotographerCards placeName={placeName} stateSlug={stateSlug} citySlug={citySlug} />}
    </div>
  );
}

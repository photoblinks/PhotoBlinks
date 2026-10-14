import Link from "next/link";
import { getPublishedLocations } from "@/lib/public-data";

/** Homepage "browse by state" cards: one link per state that has published
 * locations, to its /locations/[country]/[state] page. Counts come from the
 * cached getPublishedLocations result (no extra query). */
export async function StateCountsSection() {
  const locations = await getPublishedLocations();

  const states = new Map<string, { name: string; href: string; count: number }>();
  for (const { state, country } of locations) {
    if (!state || !country) continue;
    const entry = states.get(state.slug);
    if (entry) entry.count += 1;
    else states.set(state.slug, { name: state.name, href: `/locations/${country.slug}/${state.slug}`, count: 1 });
  }
  const sorted = [...states.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (sorted.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <h2 className="font-heading mb-4 text-2xl font-semibold">Browse by State</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((state) => (
          <Link
            key={state.href}
            href={state.href}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="text-xl font-semibold">{state.name}</h3>
            <p className="mt-1 text-muted-foreground">
              {state.count.toLocaleString("en-IN")} location{state.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

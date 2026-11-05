import Link from "next/link";
import type { Metadata } from "next";
import { getPublicPhotographers } from "@/lib/public-data";
import { PhotographersHero } from "@/components/public/photographers-hero";
import { PhotographerDirectory } from "@/components/public/photographer-directory";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildItemListJsonLd } from "@/lib/jsonld";

// ISR: only cached public data is read, so the page is statically generated
// and refreshed when a photographer is approved/edited (tag revalidation).
export const revalidate = 604800;

const TITLE = "Pre-Wedding Photographers in India";
const DESCRIPTION =
  "Find and compare pre-wedding photographers by city. See services, experience, starting prices and contact them directly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/photographers" },
  openGraph: {
    title: `${TITLE} | PhotoBlinks`,
    description: DESCRIPTION,
    url: "/photographers",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function PhotographersIndexPage() {
  const photographers = await getPublicPhotographers();

  const states = new Map<string, { name: string; href: string; count: number }>();
  for (const p of photographers) {
    const href = `/photographers/${p.country.slug}/${p.state.slug}`;
    const entry = states.get(href);
    if (entry) entry.count += 1;
    else states.set(href, { name: p.state.name, href, count: 1 });
  }
  const stateLinks = [...states.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PhotographersHero
        title="Pre-Wedding Photographers"
        subtitle="Discover trusted photographers for your pre-wedding shoot — compare styles, prices and book directly."
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {photographers.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-lg text-muted-foreground">No photographers are listed yet — check back soon.</p>
            <Link href="/sign-in/photographer" className="mt-3 inline-block font-medium text-pb-brand hover:underline">
              Are you a photographer? Join PhotoBlinks
            </Link>
          </div>
        ) : (
          <>
            <PhotographerDirectory photographers={photographers} />
            <JsonLd data={buildItemListJsonLd(TITLE, photographers.slice(0, 100).map((p) => ({ name: p.studioName, path: `/photographers/p/${p.slug}` })))} />

            {stateLinks.length > 0 && (
              <div className="mt-12 border-t pt-8">
                <h2 className="font-heading mb-3 text-xl font-semibold">Browse by state</h2>
                <div className="flex flex-wrap gap-2">
                  {stateLinks.map((state) => (
                    <Link
                      key={state.href}
                      href={state.href}
                      className="rounded-full border px-4 py-1.5 text-sm hover:bg-muted"
                    >
                      {state.name} ({state.count})
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 rounded-2xl bg-pb-brand/5 p-6 text-center">
              <h2 className="font-heading text-xl font-semibold">Are you a pre-wedding photographer?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a free profile and get discovered by couples planning their shoot.
              </p>
              <Link href="/sign-in/photographer" className="mt-3 inline-block font-medium text-pb-brand hover:underline">
                Join as a photographer
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "PhotoBlinks helps couples and photographers discover pre-wedding photoshoot locations across India.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Us | PhotoBlinks",
    description:
      "PhotoBlinks helps couples and photographers discover pre-wedding photoshoot locations across India.",
    url: "/about",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "About Us", path: "/about" }]} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">About PhotoBlinks</h1>

      <div className="mt-6 flex flex-col gap-6 leading-relaxed text-foreground/90">
        <p>
          PhotoBlinks is a discovery platform for pre-wedding photoshoot locations across India. We
          help couples and photographers find and compare locations before deciding where to shoot.
        </p>

        <section>
          <h2 className="font-heading mt-2 mb-3 text-xl font-semibold">What We Do</h2>
          <p>
            Planning a pre-wedding shoot usually starts with the same question: where? PhotoBlinks
            brings together photoshoot locations — beaches, temples, waterfalls, hills, palaces, and
            more — in one place, organized so you can browse by state, city, or category and compare
            options before you commit to one.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">How Locations Are Organized</h2>
          <p>
            Every location on PhotoBlinks belongs to a state and a city, and is grouped into a
            category such as Beach, Temple, Waterfall, or Hill. You can start broad — browsing a
            state or a category — or go straight to a specific city and category combination. Each
            individual location page brings together photos and whatever practical details are
            available, so you can get a feel for a place before visiting.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Our Approach</h2>
          <p>
            We&apos;d rather show you a handful of genuinely useful, specific details about a location
            than pad a page with generic description. See{" "}
            <Link href="/how-it-works" className="text-pb-brand hover:underline">
              How It Works
            </Link>{" "}
            for a walkthrough of using the site, and{" "}
            <Link href="/data-and-verification" className="text-pb-brand hover:underline">
              Our Data &amp; Verification
            </Link>{" "}
            for how location information is put together and kept up to date.
          </p>
        </section>
      </div>
    </div>
  );
}

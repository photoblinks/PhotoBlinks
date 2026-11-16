import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, absoluteUrl, buildOrganizationJsonLd } from "@/lib/jsonld";
import { getPublicPhotographers, getPublishedLocationCount } from "@/lib/public-data";

export const revalidate = 604800;

const TITLE = "About PhotoBlinks — Pre-Wedding Locations & Photographers in India";
const DESCRIPTION =
  "PhotoBlinks is an India-focused pre-wedding location guide, backed by local photographers who shoot there. Learn who we are, how listings are reviewed, and what we do and don't do.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/about",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const H2 = "font-heading mb-3 text-2xl font-semibold";
const LINK = "text-pb-brand hover:underline";

export default async function AboutPage() {
  const [locationCount, photographers] = await Promise.all([
    getPublishedLocationCount(),
    getPublicPhotographers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About PhotoBlinks",
          url: absoluteUrl("/about"),
          mainEntity: buildOrganizationJsonLd(),
        }}
      />
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "About Us", path: "/about" }]} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
        About PhotoBlinks: where to shoot, and who to shoot with
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-foreground/90">
        PhotoBlinks is a pre-wedding location guide for India. We list the places worth shooting at —
        beaches, temples, waterfalls, hills, palaces — and connect couples with local photographers
        who know those places. We launched with Karnataka and Kerala and are expanding across India.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">Published locations</dt>
          <dd className="font-heading text-2xl font-semibold">{locationCount}</dd>
        </div>
        <div className="rounded-xl border bg-muted/40 p-4">
          <dt className="text-sm text-muted-foreground">Listed photographers</dt>
          <dd className="font-heading text-2xl font-semibold">{photographers.length}</dd>
        </div>
        <div className="col-span-2 rounded-xl border bg-muted/40 p-4 sm:col-span-1">
          <dt className="text-sm text-muted-foreground">Launch regions</dt>
          <dd className="font-heading text-2xl font-semibold">Karnataka &amp; Kerala</dd>
        </div>
      </dl>

      <div className="mt-10 flex flex-col gap-10 leading-relaxed text-foreground/90">
        <section>
          <h2 className={H2}>Why PhotoBlinks exists</h2>
          <p>
            Planning a pre-wedding shoot starts with two questions: where, and with whom. The
            answers are usually scattered across Instagram reels, travel blogs and word of mouth —
            with no way to compare locations on practical details like entry fees, drone rules or
            the best time to visit. PhotoBlinks puts both answers in one place, organised by state,
            city and category.
          </p>
        </section>

        <section>
          <h2 className={H2}>Locations first, photographers alongside</h2>
          <p>
            Locations are the core of the site. Each{" "}
            <Link href="/locations" className={LINK}>
              location page
            </Link>{" "}
            collects photos and the practical details that decide whether a place suits your shoot.
            Photographers sit alongside that: the{" "}
            <Link href="/photographers" className={LINK}>
              photographer directory
            </Link>{" "}
            lists photographers by city with their services, experience and starting prices, and
            approved photographer photos appear on the location pages they were shot at — so you see
            a place as it really photographs, not just how it&apos;s advertised.
          </p>
        </section>

        <section>
          <h2 className={H2}>What we do — and don&apos;t do</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>We publish and maintain location listings and a photographer directory.</li>
            <li>
              We do not handle bookings, payments or reservations. You contact photographers and
              venues directly.
            </li>
            <li>
              Locations are not self-submitted by venues, and listings are not scraped from another
              database.
            </li>
          </ul>
        </section>

        <section id="data-and-verification" className="scroll-mt-24">
          <h2 className={H2}>How information is reviewed</h2>
          <p>
            Location listings are entered and reviewed by our own team through an internal admin
            workflow before they go live: photos, pricing, category and practical details such as
            entry fees, drone policy and best time to visit.
          </p>
          <p className="mt-3">
            Photographer-submitted photos and public reports about a location are never published
            automatically. They wait in a moderation queue and appear only after an admin approves
            them. Photographer profiles can be claimed by the photographer; our team checks each
            claim before the profile can be managed, and verified profiles carry a verified badge.
          </p>
          <p className="mt-3">
            <strong>What &quot;published&quot; means:</strong> our team reviewed the listing and chose
            to publish it. It does not mean every fact was independently confirmed with the venue or
            an authority. Fees, photography and drone permissions, and timings can change without
            notice — details reflect what was known when the page was last updated, so confirm
            anything important directly before you travel.
          </p>
        </section>

        <section>
          <h2 className={H2}>Corrections and contact</h2>
          <p>
            Spotted something wrong or outdated? Use{" "}
            <Link href="/report-an-issue" className={LINK}>
              Report an Issue
            </Link>{" "}
            — reports go to our moderation team. For anything else, see our{" "}
            <Link href="/contact" className={LINK}>
              contact page
            </Link>
            . Photographers can{" "}
            <Link href="/sign-in/photographer" className={LINK}>
              join PhotoBlinks
            </Link>{" "}
            or claim an existing listing.
          </p>
          <p className="mt-3">
            New here? Read{" "}
            <Link href="/how-it-works" className={LINK}>
              How PhotoBlinks Works
            </Link>{" "}
            for a walkthrough for couples and photographers.
          </p>
        </section>
      </div>
    </div>
  );
}

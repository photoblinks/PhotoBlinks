import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Our Data & Verification",
  description: "How PhotoBlinks maintains location information, and what \"published\" does and doesn't mean.",
  alternates: { canonical: "/data-and-verification" },
  openGraph: {
    title: "Our Data & Verification | PhotoBlinks",
    description: "How PhotoBlinks maintains location information, and what \"published\" does and doesn't mean.",
    url: "/data-and-verification",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function DataAndVerificationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Our Data & Verification", path: "/data-and-verification" },
        ]}
      />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Our Data &amp; Verification</h1>
      <p className="mt-4 leading-relaxed text-foreground/90">
        This page explains where location information on PhotoBlinks comes from, what it means for a
        listing to be published, and why you should always confirm important details directly with a
        location before visiting.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">How Location Information Is Maintained</h2>
          <p className="leading-relaxed text-foreground/90">
            Location listings on PhotoBlinks are put together and maintained by our own team through
            an internal admin workflow — details like photos, pricing, category, and practical
            information (entry fees, drone policy, best time to visit, and similar) are entered and
            reviewed before a listing goes live. Locations are not self-submitted by venues, and
            listings are not automatically pulled from an external database.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">What &quot;Published&quot; Means</h2>
          <p className="leading-relaxed text-foreground/90">
            A listing being visible on PhotoBlinks means our team has reviewed and chosen to publish
            it. It does not mean every fact on the page has been independently verified with the
            location or a governing authority. We aim for listings to be accurate and useful at the
            time they&apos;re published, but we don&apos;t claim a formal verification process beyond our own
            internal review.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Information Can Change</h2>
          <p className="leading-relaxed text-foreground/90">
            Entry fees, photography or drone permissions, access rules, and timings are all things a
            location can change at any time, often without any public notice. Details like these on a
            PhotoBlinks listing reflect what was known when the page was last updated — they are not
            guaranteed to be current. Please confirm anything that matters to your plans directly with
            the location before traveling or scheduling a shoot.
          </p>
        </section>
      </div>

      <div className="mt-10 rounded-xl border bg-muted/40 p-5">
        <p className="leading-relaxed text-foreground/90">
          Found something that looks incorrect or outdated?{" "}
          <Link href="/report-an-issue" className="font-medium text-pb-brand hover:underline">
            Let us know.
          </Link>
        </p>
      </div>
    </div>
  );
}

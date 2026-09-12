import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms that apply to using the PhotoBlinks website.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms & Conditions | PhotoBlinks",
    description: "The terms that apply to using the PhotoBlinks website.",
    url: "/terms",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const LAST_UPDATED = "September 4, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Terms & Conditions", path: "/terms" }]} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-6 leading-relaxed text-foreground/90">
        <p>
          These terms apply to your use of the PhotoBlinks website. By using the site, you agree to
          them. If you don&apos;t agree, please don&apos;t use the site.
        </p>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Use of This Website</h2>
          <p>
            PhotoBlinks is a discovery and information platform for pre-wedding photoshoot locations
            across India. The site is provided for personal, non-commercial use to help you research
            and compare locations.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Informational Nature of Location Information</h2>
          <p>
            Content on location pages — including pricing, fees, permissions, drone policy, timings,
            and similar details — is provided for general informational purposes. As explained in{" "}
            <Link href="/data-and-verification" className="text-pb-brand hover:underline">
              Our Data &amp; Verification
            </Link>
            , publication on PhotoBlinks reflects our team&apos;s internal review, not an independent
            verification with every location or authority, and details can change without notice.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Your Responsibility to Confirm Details</h2>
          <p>
            Before traveling to or planning a shoot at any location listed on PhotoBlinks, you&apos;re
            responsible for independently confirming fees, permissions, access rules, and any other
            details that matter to you directly with that location.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">No Booking, Payment, or Vendor Services</h2>
          <p>
            PhotoBlinks does not currently provide venue booking, reservations, payment processing,
            event management, or any vendor/venue marketplace service. We don&apos;t act as an intermediary
            between you and any location, photographer, or vendor.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">External Links</h2>
          <p>
            The site links to external services such as Google Maps, Mapbox, and YouTube. We aren&apos;t
            responsible for the content, accuracy, or practices of these external services.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Intellectual Property</h2>
          <p>
            The PhotoBlinks name, logo, and site design are the property of PhotoBlinks. Location
            photos and content are used to help you evaluate a location for your own shoot and
            shouldn&apos;t be reused elsewhere without permission.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Prohibited Use</h2>
          <p>
            Please don&apos;t misuse the site — including scraping or bulk-extracting content, attempting
            to disrupt the site&apos;s operation, or submitting false or abusive reports.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Limitation of Liability</h2>
          <p>
            PhotoBlinks provides location information on an &quot;as is&quot; basis and doesn&apos;t guarantee its
            accuracy or completeness. We aren&apos;t liable for decisions made, costs incurred, or issues
            arising from relying on information found on the site instead of confirming it directly
            with a location.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Reporting Incorrect Information</h2>
          <p>
            If you spot something inaccurate or outdated, please let us know via{" "}
            <Link href="/report-an-issue" className="text-pb-brand hover:underline">
              Report an Issue
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Changes to These Terms</h2>
          <p>
            We may update these terms as the site changes. We&apos;ll update the &quot;Last updated&quot; date above
            when we do.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Contact</h2>
          <p>
            Questions about these terms can be sent through our{" "}
            <Link href="/contact" className="text-pb-brand hover:underline">
              Contact page
            </Link>
            .
          </p>
        </section>

        <p className="border-t pt-6 text-sm text-muted-foreground">
          These terms describe our current service in plain language and aren&apos;t a substitute for
          professional legal advice.
        </p>
      </div>
    </div>
  );
}

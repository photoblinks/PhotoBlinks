import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PhotoBlinks handles data when you use the website.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy | PhotoBlinks",
    description: "How PhotoBlinks handles data when you use the website.",
    url: "/privacy",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const LAST_UPDATED = "September 4, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Privacy Policy", path: "/privacy" }]} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-6 leading-relaxed text-foreground/90">
        <p>
          This policy describes how PhotoBlinks (&quot;we&quot;, &quot;us&quot;) handles data when you use this website.
          It covers what the site actually does today — it does not describe features that aren&apos;t
          available yet.
        </p>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Information We Collect</h2>
          <p>
            Browsing PhotoBlinks doesn&apos;t require creating an account or providing any personal
            information. We don&apos;t currently offer sign-in, user accounts, reviews, or any way to
            submit personal data through the site.
          </p>
          <p className="mt-3">The site does process a small amount of information automatically:</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <span className="font-medium">Standard web traffic data</span> — like any website, our
              hosting infrastructure processes basic request information (such as IP address and
              browser type) needed to serve pages.
            </li>
            <li>
              <span className="font-medium">Location, only if you choose to share it</span> — some
              pages offer a &quot;My Location&quot; option to sort results by distance. This uses your
              browser&apos;s own location permission prompt; we only receive your coordinates if you
              actively enable it, and we don&apos;t store them.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Analytics</h2>
          <p>
            We use Google Analytics to understand how the site is used (for example, which pages are
            visited). Google Analytics sets its own cookies and processes data according to{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-pb-brand hover:underline"
            >
              Google&apos;s Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Embedded Third-Party Content</h2>
          <p>Location pages may include content hosted by other providers:</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <span className="font-medium">Mapbox</span> — some pages show an embedded map. See{" "}
              <a
                href="https://www.mapbox.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-pb-brand hover:underline"
              >
                Mapbox&apos;s Privacy Policy
              </a>
              .
            </li>
            <li>
              <span className="font-medium">YouTube</span> — where a location has a video, we embed
              it directly from YouTube. See{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-pb-brand hover:underline"
              >
                Google&apos;s Privacy Policy
              </a>
              .
            </li>
            <li>
              <span className="font-medium">Google Maps</span> — the &quot;Go to Location&quot; button links
              out to Google Maps for directions. This opens Google&apos;s own site and is covered by
              Google&apos;s Privacy Policy, not this one.
            </li>
          </ul>
          <p className="mt-3">
            These providers may set their own cookies or collect data when their embedded content
            loads, independently of PhotoBlinks.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">What We Don&apos;t Currently Collect</h2>
          <p>
            We don&apos;t currently offer Google Sign-In or any other sign-in method, user accounts,
            reviews or ratings, or payment processing — so no data related to any of these is
            collected, because these features don&apos;t exist on the site yet. If that changes, this
            policy will be updated to reflect it.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Admin Access</h2>
          <p>
            PhotoBlinks has a private admin area used by our team to manage location listings, which
            requires a sign-in. This is not available to the public and doesn&apos;t involve visitor data.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Changes to This Policy</h2>
          <p>
            We may update this policy as the site changes. We&apos;ll update the &quot;Last updated&quot; date above
            when we do.
          </p>
        </section>

        <section>
          <h2 className="font-heading mb-3 text-xl font-semibold">Contact</h2>
          <p>
            Questions about this policy can be sent through our{" "}
            <Link href="/contact" className="text-pb-brand hover:underline">
              Contact page
            </Link>
            .
          </p>
        </section>

        <p className="border-t pt-6 text-sm text-muted-foreground">
          This page is a practical description of our current data handling, not a substitute for
          professional legal advice.
        </p>
      </div>
    </div>
  );
}

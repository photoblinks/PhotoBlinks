import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { DEFAULT_OG_IMAGE, buildPageJsonLd } from "@/lib/jsonld";

const TITLE = "How PhotoBlinks Works — Find Locations & Pre-Wedding Photographers";
const DESCRIPTION =
  "Step-by-step: how couples find and compare pre-wedding locations and photographers on PhotoBlinks, how photographers join, and how every listing is reviewed.";

const BREADCRUMBS = [{ name: "Home", path: "/" }, { name: "How It Works", path: "/how-it-works" }];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/how-it-works",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const LINK = "text-pb-brand hover:underline";

const COUPLE_STEPS = [
  {
    title: "Browse by state, city and category",
    body: "Start from the Locations section. Narrow by state and city, then by category — Beach, Temple, Waterfall, Hill and more — or use the budget filter.",
  },
  {
    title: "Open a location page",
    body: "Each page has photos and, where available, practical details: pricing, drone policy and best time to visit.",
  },
  {
    title: "See real photographer work",
    body: "Approved photos from photographers who shot at the location appear on its page, so you can judge how the place photographs in practice.",
  },
  {
    title: "Compare photographers in your city",
    body: "The photographer directory is organised by state and city. Profiles show services, experience and starting prices.",
  },
  {
    title: "Contact the photographer directly",
    body: "Reach photographers by call or WhatsApp from their profile. PhotoBlinks does not take bookings or payments — you agree terms with them directly.",
  },
  {
    title: "Confirm details before you travel",
    body: "Fees, permissions and timings change. Check the details that matter with the venue first.",
  },
];

const PHOTOGRAPHER_STEPS = [
  {
    title: "Create an account or claim your profile",
    body: "Join through the photographer sign-in, or, if you are already listed, claim your existing profile.",
  },
  {
    title: "Our team checks your details",
    body: "Claims are verified by our team before you can manage a profile (usually 24–48 hours).",
  },
  {
    title: "Submit photos for a location",
    body: "Each photo submission targets one existing location or studio and starts as pending.",
  },
  {
    title: "Admin approves or rejects",
    body: "Only approved photos appear publicly. Rejected photos are removed from storage.",
  },
];

function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="mt-6 flex flex-col gap-6">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pb-brand/10 font-heading font-semibold text-pb-brand">
            {index + 1}
          </span>
          <div>
            <h3 className="font-heading text-lg font-semibold">{step.title}</h3>
            <p className="mt-1 leading-relaxed text-foreground/90">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <JsonLd
        data={buildPageJsonLd({
          type: "WebPage",
          name: "How It Works",
          description: metadata.description,
          path: "/how-it-works",
          breadcrumbItems: BREADCRUMBS,
        })}
      />
      <Breadcrumbs items={BREADCRUMBS} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">How PhotoBlinks Works</h1>
      <p className="mt-4 text-lg leading-relaxed text-foreground/90">
        PhotoBlinks helps you choose where to shoot and who to shoot with. We list locations and
        photographers; we don&apos;t handle bookings, payments or reservations. Here is how it works
        for couples and for photographers. Who we are and how we review listings is on the{" "}
        <Link href="/about" className={LINK}>
          About page
        </Link>
        .
      </p>

      <section className="mt-10">
        <h2 className="font-heading text-2xl font-semibold">For couples</h2>
        <StepList steps={COUPLE_STEPS} />
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-2xl font-semibold">For photographers</h2>
        <StepList steps={PHOTOGRAPHER_STEPS} />
        <p className="mt-6 leading-relaxed text-foreground/90">
          <Link href="/sign-in/photographer" className={LINK}>
            Join as a photographer
          </Link>{" "}
          or browse the{" "}
          <Link href="/photographers" className={LINK}>
            photographer directory
          </Link>
          .
        </p>
      </section>

      <section className="mt-12 rounded-xl border bg-muted/40 p-5">
        <h2 className="font-heading text-xl font-semibold">How we keep listings trustworthy</h2>
        <p className="mt-2 leading-relaxed text-foreground/90">
          Locations are reviewed by our team before publishing. Photographer photos and public
          reports are moderated before anything appears. Details can still change at the venue, so
          see{" "}
          <Link href="/about#data-and-verification" className={LINK}>
            how information is reviewed
          </Link>{" "}
          or{" "}
          <Link href="/report-an-issue" className={LINK}>
            report an issue
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

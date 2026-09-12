import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "How It Works",
  description: "How to browse, compare, and research pre-wedding photoshoot locations on PhotoBlinks.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How It Works | PhotoBlinks",
    description: "How to browse, compare, and research pre-wedding photoshoot locations on PhotoBlinks.",
    url: "/how-it-works",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS = [
  {
    title: "Browse locations",
    body: "Start from the homepage or the Locations section and browse what's available across India.",
  },
  {
    title: "Choose a state, city, or category",
    body: "Narrow down by state, city, or a category like Beach, Temple, Waterfall, or Hill — whichever makes sense for how you're planning.",
  },
  {
    title: "Use the filters",
    body: "Refine further by city, category, or budget using the filter bar on any browsing page.",
  },
  {
    title: "Open a location",
    body: "Each location has its own page with photos and, where available, practical details like pricing, drone policy, and best time to visit.",
  },
  {
    title: "Review the available information",
    body: "Check whatever details the location page provides — see Our Data & Verification for what that information means and its limits.",
  },
  {
    title: "Compare your options",
    body: "Open a few locations side by side before deciding which fits your shoot.",
  },
  {
    title: "Confirm directly with the location before visiting",
    body: "Fees, permissions, and timings can change — always confirm the details that matter to you directly with the venue before you travel or plan your shoot.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[{ name: "Home", path: "/" }, { name: "How It Works", path: "/how-it-works" }]}
      />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">How PhotoBlinks Works</h1>
      <p className="mt-4 leading-relaxed text-foreground/90">
        PhotoBlinks is a discovery and information platform — we help you find and research
        pre-wedding photoshoot locations. We don&apos;t handle bookings, payments, or reservations; the
        steps below are how people typically use the site.
      </p>

      <ol className="mt-8 flex flex-col gap-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pb-brand/10 font-heading font-semibold text-pb-brand">
              {index + 1}
            </span>
            <div>
              <h2 className="font-heading text-lg font-semibold">{step.title}</h2>
              <p className="mt-1 leading-relaxed text-foreground/90">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 border-t pt-6 leading-relaxed text-foreground/90">
        Read more about{" "}
        <Link href="/about" className="text-pb-brand hover:underline">
          who we are
        </Link>{" "}
        or how we{" "}
        <Link href="/data-and-verification" className="text-pb-brand hover:underline">
          maintain location information
        </Link>
        .
      </p>
    </div>
  );
}

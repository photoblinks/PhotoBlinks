import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Report an Issue",
  description: "Report incorrect or outdated information on a PhotoBlinks location listing.",
  alternates: { canonical: "/report-an-issue" },
  openGraph: {
    title: "Report an Issue | PhotoBlinks",
    description: "Report incorrect or outdated information on a PhotoBlinks location listing.",
    url: "/report-an-issue",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const ISSUE_TYPES = [
  "Incorrect location information",
  "Outdated pricing or fees",
  "Incorrect access information",
  "Incorrect drone policy",
  "Incorrect pre-wedding shoot permission information",
  "Incorrect or misleading photos",
  "A duplicate listing",
  "Any other factual problem",
];

export default function ReportAnIssuePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[{ name: "Home", path: "/" }, { name: "Report an Issue", path: "/report-an-issue" }]}
      />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Report an Issue</h1>
      <p className="mt-4 leading-relaxed text-foreground/90">
        See something on a location page that's wrong or out of date? As explained in{" "}
        <Link href="/data-and-verification" className="text-pb-brand hover:underline">
          Our Data &amp; Verification
        </Link>
        , details like fees and permissions can change, and we rely on reports like yours to keep
        listings accurate. You can let us know about:
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {ISSUE_TYPES.map((issue) => (
          <li key={issue} className="flex items-start gap-2 leading-relaxed text-foreground/90">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-pb-brand" />
            {issue}
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-xl border bg-muted/40 p-5">
        <p className="leading-relaxed text-foreground/90">
          We don't yet have a dedicated report form on the site. For now, please reach out through{" "}
          <Link href="/contact" className="font-medium text-pb-brand hover:underline">
            Contact Us
          </Link>{" "}
          and mention the location name and what looks wrong — that's enough for us to look into it.
        </p>
      </div>
    </div>
  );
}

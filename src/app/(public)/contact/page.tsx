import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { RevealEmailButton } from "@/components/public/reveal-email-button";
import { DEFAULT_OG_IMAGE } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the PhotoBlinks team.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Us | PhotoBlinks",
    description: "Get in touch with the PhotoBlinks team.",
    url: "/contact",
    siteName: "PhotoBlinks",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Contact Us", path: "/contact" }]} />

      <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Contact Us</h1>
      <p className="mt-4 leading-relaxed text-foreground/90">
        Have a question, or something to report about a location listing? We&apos;d like to hear
        from you.
      </p>

      <div className="mt-8">
        <RevealEmailButton email="contact@photoblinks.com" />
      </div>

      <p className="mt-8 leading-relaxed text-foreground/90">
        If you&apos;re reporting incorrect or outdated information on a specific location, see{" "}
        <Link href="/report-an-issue" className="text-pb-brand hover:underline">
          Report an Issue
        </Link>{" "}
        for what details are most helpful to include.
      </p>
    </div>
  );
}

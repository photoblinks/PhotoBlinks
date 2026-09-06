import Link from "next/link";
import { Aperture } from "lucide-react";
import { getActiveCategories } from "@/lib/public-data";

const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/locations", label: "Locations" },
  { href: "/studios", label: "Studios" },
  { href: "/locations/map", label: "Map" },
];

const TRUST_LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/data-and-verification", label: "Data & Verification" },
  { href: "/report-an-issue", label: "Report an Issue" },
  { href: "/contact", label: "Contact Us" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
];

export async function Footer() {
  const categories = await getActiveCategories();
  const linkedCategories = categories.slice(0, 6);

  return (
    <footer className="bg-pb-brand text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Aperture className="size-6" strokeWidth={1.75} />
            <span className="font-heading text-lg font-semibold">PhotoBlinks</span>
          </Link>
          <p className="max-w-xs text-sm text-white/70">
            Discover the best pre-wedding shoot locations across India.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">
            Explore
          </h3>
          <ul className="flex flex-col gap-2 text-sm text-white/70">
            {EXPLORE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {linkedCategories.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">
              Categories
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-white/70">
              {linkedCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="transition-colors hover:text-white"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">
            Trust &amp; Information
          </h3>
          <ul className="flex flex-col gap-2 text-sm text-white/70">
            {TRUST_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/60 sm:px-6">
        © {new Date().getFullYear()} PhotoBlinks. All rights reserved.
      </div>
    </footer>
  );
}

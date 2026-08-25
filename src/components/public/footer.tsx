import Link from "next/link";
import { Aperture } from "lucide-react";
import { getActiveCategories, getCategoryLandingPaths } from "@/lib/public-data";

const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/locations", label: "Locations" },
  { href: "/studios", label: "Studios" },
  { href: "/locations/map", label: "Map" },
];

export async function Footer() {
  const [categories, landingPaths] = await Promise.all([
    getActiveCategories(),
    getCategoryLandingPaths(),
  ]);
  const linkedCategories = categories
    .filter((category) => landingPaths.has(category.slug))
    .slice(0, 6);

  return (
    <footer className="bg-pb-brand text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Aperture className="size-6" strokeWidth={1.75} />
            <span className="font-heading text-lg font-semibold">PhotoBlinks</span>
          </Link>
          <p className="max-w-xs text-sm text-white/70">
            Discover breathtaking photoshoot locations across Karnataka and Kerala.
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
                    href={landingPaths.get(category.slug)!}
                    className="transition-colors hover:text-white"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/60 sm:px-6">
        © {new Date().getFullYear()} PhotoBlinks. All rights reserved.
      </div>
    </footer>
  );
}

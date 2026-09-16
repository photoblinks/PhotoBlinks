import Link from "next/link";
import { Camera, MapPin, Compass } from "lucide-react";
import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { Button } from "@/components/ui/button";
import { getActiveCategories } from "@/lib/public-data";
import { getCategoryMarkerStyle } from "@/lib/category-style";

// Root-level not-found.tsx (Next.js catches both explicit notFound() calls
// and genuinely unmatched URLs here). It renders inside the root layout
// only, which has no Header/Footer of its own — see (public)/layout.tsx —
// so this page wires up the same public shell by hand instead of duplicating
// its markup, keeping the 404 visually consistent with the rest of the site.
// No metadata export: Next serves this with a 404 status automatically, and
// an unindexable, non-canonical page needs no SEO metadata of its own.
export default async function NotFound() {
  const categories = await getActiveCategories();

  return (
    <div className="pb-theme relative flex min-h-screen flex-col bg-pb-cream">
      <Header categories={categories} />
      <main className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="flex size-16 items-center justify-center rounded-full bg-pb-brand/10">
            <Compass className="size-8 text-pb-brand" aria-hidden="true" />
          </span>

          <p className="font-heading mt-6 text-sm font-semibold tracking-wide text-pb-brand uppercase">
            404 error
          </p>
          <h1 className="font-heading mt-2 text-3xl font-semibold sm:text-4xl">Page not found</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            We couldn&apos;t find the page you were looking for. It may have been moved, renamed, or
            never existed. Let&apos;s get you back to discovering pre-wedding photoshoot locations.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/" />}>Go to homepage</Button>
            <Button
              variant="outline"
              render={<Link href="/locations" />}
            >
              <MapPin aria-hidden="true" />
              Browse all locations
            </Button>
            <Button
              variant="outline"
              render={<Link href="/studios" />}
            >
              <Camera aria-hidden="true" />
              Browse studios
            </Button>
          </div>

          {categories.length > 0 && (
            <div className="mt-14 w-full border-t pt-8">
              <h2 className="font-heading mb-4 text-xl font-semibold">Explore by category</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {categories.slice(0, 8).map((category) => {
                  const { color, icon: Icon } = getCategoryMarkerStyle(category.slug);
                  return (
                    <Link
                      key={category.slug}
                      href={`/category/${category.slug}`}
                      className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                    >
                      <span
                        style={{ backgroundColor: color }}
                        className="flex size-10 items-center justify-center rounded-full text-white"
                      >
                        <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium">{category.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <nav aria-label="More pages" className="mt-14 w-full border-t pt-8">
            <h2 className="font-heading mb-4 text-xl font-semibold">Or try one of these</h2>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <li>
                <Link href="/locations/map" className="text-pb-brand hover:underline">
                  Map view
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-pb-brand hover:underline">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-pb-brand hover:underline">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/report-an-issue" className="text-pb-brand hover:underline">
                  Report an issue
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-pb-brand hover:underline">
                  Contact us
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </main>
      <Footer />
    </div>
  );
}

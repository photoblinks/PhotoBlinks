import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Tag, Navigation, ChevronDown } from "lucide-react";
import { getActiveCategories, getPublishedLocationBySlug } from "@/lib/public-data";
import { formatPricing } from "@/lib/format";
import { getCategoryMarkerStyle } from "@/lib/category-style";
import { ImageGallery } from "@/components/public/image-gallery";
import { ShareButton } from "@/components/public/share-button";
import { YouTubeEmbed } from "@/components/public/youtube-embed";
import { MiniMap } from "@/components/public/mini-map";
import { DistanceDisplay } from "@/components/public/distance-display";
import { GoToLocationButton } from "@/components/public/go-to-location-button";
import { ActionButton } from "@/components/public/action-button";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { ExtraDetailsList, hasExtraDetails } from "@/components/public/extra-details-list";
import { LocationJsonLd } from "@/components/public/location-json-ld";
import { absoluteUrl } from "@/lib/jsonld";

type Props = { params: Promise<{ slug: string }> };

// No searchParams/cookies here, so this route is eligible for ISR — the
// same 60s window as the underlying cached data queries (public-data.ts).
// generateStaticParams is required (even empty) for a dynamic segment to
// use ISR at all — without it Next renders it fully dynamic on every
// request regardless of `revalidate` (see Next's generateStaticParams
// docs: "you must always return an array... otherwise the route will be
// dynamically rendered"). An empty array means every slug is generated
// on-demand on first visit, then served from cache until revalidation.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) return {};

  const place = [location.city?.name, location.state?.name].filter(Boolean).join(", ");
  const title =
    location.meta_title ||
    `${location.name} - Pre-Wedding Photoshoot Location in ${location.city?.name ?? place}`;
  const description =
    location.meta_description ||
    location.description ||
    (location.category
      ? `${location.name}, a ${location.category.name.toLowerCase()} pre-wedding photoshoot location in ${place}.`
      : `${location.name}, a pre-wedding photoshoot location in ${place}.`);

  return {
    title,
    description,
    alternates: { canonical: `/location/${location.slug}` },
    openGraph: {
      title,
      description,
      url: `/location/${location.slug}`,
      siteName: "PhotoBlinks",
      type: "website",
      images: location.images[0] ? [location.images[0]] : undefined,
    },
  };
}

export default async function LocationDetailPage({ params }: Props) {
  const { slug } = await params;
  const location = await getPublishedLocationBySlug(slug);
  if (!location) notFound();

  const hasCoords = location.latitude != null && location.longitude != null;

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    ...(location.country
      ? [{ name: location.country.name, path: `/locations/${location.country.slug}` }]
      : []),
    ...(location.country && location.state
      ? [{ name: location.state.name, path: `/locations/${location.country.slug}/${location.state.slug}` }]
      : []),
    ...(location.country && location.state && location.city
      ? [
          {
            name: location.city.name,
            path: `/locations/${location.country.slug}/${location.state.slug}/${location.city.slug}`,
          },
        ]
      : []),
    ...(location.country && location.state && location.city && location.category
      ? [
          {
            name: location.category.name,
            path: `/locations/${location.country.slug}/${location.state.slug}/${location.city.slug}/${location.category.slug}`,
          },
        ]
      : []),
  ];

  // "Heritage - India, Karnataka, Bangalore" — shown under the location
  // name in place of a separate Category/Country/State/City list.
  const subtitle = [
    location.category?.name,
    [location.country?.name, location.state?.name, location.city?.name].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" - ");

  // The headline price always reflects pricing_type/price — the photoshoot
  // price PhotoBlinks itself charges. entry_fee is a distinct, separately
  // labeled fact (e.g. a venue's own admission ticket) shown in the details
  // table below; it must never stand in for the photoshoot price here.
  const priceDisplay = formatPricing(location.pricing_type, location.price);

  // The admin-entered caption takes priority over the pricing-type defaults;
  // falls back to the old hardcoded text for locations that haven't set it.
  const priceCaption =
    location.price_note ||
    (location.pricing_type === "paid"
      ? "Photoshoot Price"
      : location.pricing_type === "free"
        ? "Free Photoshoot Location"
        : undefined);

  const imageAlt = location.city ? `${location.name} in ${location.city.name}` : location.name;

  // Quick-nav category cards at the bottom of the page — categories other
  // than this location's own (more useful for exploring something
  // different), capped at 4 for a clean small-card row.
  const allCategories = await getActiveCategories();
  const exploreCategories = allCategories
    .filter((c) => c.slug !== location.category?.slug)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={breadcrumbItems} includeJsonLd={false} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{location.name}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        <ShareButton title={location.name} url={absoluteUrl(`/location/${location.slug}`)} />
      </div>

      <ImageGallery images={location.images} alt={imageAlt} />

      <h2 className="font-heading mt-10 mb-4 text-xl font-semibold">
        {location.name} Photoshoot Details &amp; Pricing
      </h2>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">{hasExtraDetails(location) && <ExtraDetailsList details={location} />}</div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full bg-pb-brand/10">
                <Tag className="size-3.5 text-pb-brand" />
              </span>
              Pricing
            </h3>
            <p className="font-heading text-3xl font-semibold">{priceDisplay}</p>
            {priceCaption && <p className="text-sm text-muted-foreground">{priceCaption}</p>}
            <ActionButton
              actionType={location.action_type}
              actionValue={location.action_value}
              className="mt-4 w-full"
            />
          </div>
        </aside>
      </div>

      {location.description && (
        <div className="mt-6">
          <h2 className="font-heading mb-3 text-xl font-semibold">{location.name} Photoshoot Overview</h2>
          <p className="leading-relaxed text-foreground/90">{location.description}</p>
        </div>
      )}

      {location.youtube_url && (
        <div className="mt-8">
          <h2 className="font-heading mb-3 text-xl font-semibold">
            {location.name} Tour &amp; Photoshoot Video
          </h2>
          <YouTubeEmbed url={location.youtube_url} title={location.name} />
        </div>
      )}

      {(hasCoords || location.map_url) && (
        <div className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">
            {location.name} Location &amp; Map Directions
          </h2>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-2">
            <div className="flex flex-col justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{location.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[location.city?.name, location.state?.name].filter(Boolean).join(", ")}
                </p>
              </div>
              {hasCoords && (
                <div className="flex items-start gap-2 text-sm">
                  <Navigation className="mt-0.5 size-4 shrink-0 text-pb-brand" />
                  <div>
                    <p className="text-muted-foreground">Distance from you</p>
                    <DistanceDisplay latitude={location.latitude!} longitude={location.longitude!} />
                  </div>
                </div>
              )}
              <GoToLocationButton
                mapUrl={location.map_url}
                latitude={location.latitude}
                longitude={location.longitude}
              />
            </div>
            <div className="min-h-64">
              {hasCoords ? (
                <MiniMap latitude={location.latitude!} longitude={location.longitude!} label={location.name} />
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center bg-muted text-sm text-muted-foreground">
                  Map unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {location.faqs.length > 0 && (
        <div className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">
            Frequently Asked Questions About {location.name}
          </h2>
          <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
            {location.faqs.map((faq, index) => (
              <details key={index} className="group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
                  {faq.question}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {exploreCategories.length > 0 && (
        <div className="mt-10 border-t pt-6">
          <h2 className="font-heading mb-4 text-xl font-semibold">Explore More Locations</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {exploreCategories.map((category) => {
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
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <span className="text-sm font-medium">{category.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <LocationJsonLd location={location} breadcrumbItems={breadcrumbItems} />
    </div>
  );
}

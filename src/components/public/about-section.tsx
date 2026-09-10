import Image from "next/image";

/** SEO/GEO informational section on the homepage, between the browse
 * content and the footer — a real, crawlable heading + paragraph (not
 * baked into the image) describing the platform's scale using live
 * published-location and active-category data. */
export function AboutSection({
  locationCount,
  categoryNames,
  imageUrl,
}: {
  locationCount: number;
  categoryNames: string[];
  imageUrl: string | null;
}) {
  const categoryList =
    categoryNames.length > 0 ? `${categoryNames.join(", ")}, and more` : "a range of categories";

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <div className="flex flex-col gap-5 rounded-[20px] border border-border bg-muted p-5 sm:h-[230px] sm:flex-row sm:items-center sm:gap-8 sm:p-6 lg:rounded-[22px]">
        {imageUrl && (
          <div className="relative aspect-16/9 w-full shrink-0 overflow-hidden rounded-2xl sm:aspect-auto sm:h-full sm:w-[38%]">
            <Image
              src={imageUrl}
              alt="A pre-wedding couple at a Photoblinks shoot location"
              fill
              sizes="(min-width: 640px) 38vw, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-pb-brand-bright uppercase">
            Locations · Stories · Memories
          </p>
          <h2 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
            India&rsquo;s Biggest Pre-Wedding Location Finder
          </h2>
          <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
            Photoblinks is a dedicated pre-wedding location-finding website, designed specifically
            for couples looking for beautiful places to create their special memories. With{" "}
            {locationCount.toLocaleString("en-IN")}+ active locations across the country, discover
            pre-wedding shoot locations across cities and states, with categories including{" "}
            {categoryList}.
          </p>
        </div>
      </div>
    </section>
  );
}

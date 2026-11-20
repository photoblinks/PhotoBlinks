import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Camera, Globe, Languages, MapPin, Plane, Store, Wallet, Award } from "lucide-react";
import { YoutubeIcon } from "@/components/public/social-platform-icons";
import { ContactRevealButton } from "@/components/public/contact-reveal-button";
import { getPublicPhotographerBySlug, getPublicPhotographerPackages, getPublicPhotographers } from "@/lib/public-data";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABEL } from "@/lib/photographer-options";
import { PackageCard } from "@/components/public/package-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { PhotographerCard } from "@/components/public/photographer-card";
import { ShareButton } from "@/components/public/share-button";
import { VerifiedBadge } from "@/components/public/verified-badge";
import { Button } from "@/components/ui/button";
import { absoluteUrl, buildBreadcrumbNode, buildFaqPage, buildGraph, socialImageUrl, websiteRef } from "@/lib/jsonld";
import { buildPhotographerSeo } from "@/lib/photographer-seo";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicPhotographerBySlug(slug);
  if (!p) return {};

  const { title, description } = buildPhotographerSeo(p, await getPublicPhotographerPackages(p.id));
  const path = `/photographers/p/${p.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    // Unclaimed profiles are thin; only claimed ones (packages, real content) may be indexed.
    robots: p.isClaimed ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "profile",
      images: [{ url: `${path}/og`, width: 1200, height: 630, alt: `${p.studioName} — pre-wedding photographer` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${path}/og`] },
  };
}

export default async function PhotographerPage({ params }: Props) {
  const { slug } = await params;
  const p = await getPublicPhotographerBySlug(slug);
  if (!p) notFound();

  const packages = await getPublicPhotographerPackages(p.id);
  const sameCity = (await getPublicPhotographers())
    .filter((o) => o.id !== p.id && o.country.slug === p.country.slug && o.state.slug === p.state.slug)
    .sort((a, b) => Number(b.citySlug === p.citySlug) - Number(a.citySlug === p.citySlug))
    .slice(0, 4);

  const path = `/photographers/p/${p.slug}`;
  const cityPath = `/photographers/${p.country.slug}/${p.state.slug}/${p.citySlug}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Photographers", path: "/photographers" },
    { name: p.state.name, path: `/photographers/${p.country.slug}/${p.state.slug}` },
    { name: p.city, path: cityPath },
    { name: p.studioName, path },
  ];

  const facts = [
    p.startingPrice != null && { icon: Wallet, label: "Starting price", value: `₹${p.startingPrice.toLocaleString("en-IN")}` },
    p.experienceYears != null && {
      icon: Award,
      label: "Experience",
      value: `${p.experienceYears} year${p.experienceYears === 1 ? "" : "s"}`,
    },
    p.languages.length > 0 && { icon: Languages, label: "Languages", value: p.languages.join(", ") },
    p.travelsToOtherCities && { icon: Plane, label: "Travel", value: "Available for other cities" },
  ].filter((fact): fact is { icon: typeof Wallet; label: string; value: string } => Boolean(fact));

  const seo = buildPhotographerSeo(p, packages);
  const pageUrl = absoluteUrl(path);
  const images = [p.logoUrl ?? p.avatarUrl, p.bannerUrl].filter((u): u is string => Boolean(u)).map(socialImageUrl);
  const prices = packages.map((k) => k.offerPrice ?? k.actualPrice);

  // One @graph: the business (LocalBusiness + ProfessionalService), the
  // ProfilePage describing it, and a FAQPage mirroring the visible FAQ.
  const jsonLd = buildGraph([
      {
        "@type": ["LocalBusiness", "ProfessionalService"],
        "@id": `${pageUrl}#business`,
        name: p.studioName,
        url: pageUrl,
        description: p.bio || seo.summary,
        image: images.length > 0 ? images : undefined,
        logo: p.logoUrl ? socialImageUrl(p.logoUrl) : undefined,
        priceRange: prices.length > 0 ? `From ₹${Math.min(...prices)}` : p.startingPrice != null ? `From ₹${p.startingPrice}` : undefined,
        founder: { "@type": "Person", name: p.displayName },
        address: { "@type": "PostalAddress", addressLocality: p.city, addressRegion: p.state.name, addressCountry: p.country.name },
        areaServed: { "@type": "City", name: p.city, containedInPlace: { "@type": "State", name: p.state.name } },
        knowsLanguage: p.languages.length > 0 ? p.languages : undefined,
        knowsAbout: p.services.length > 0 ? p.services : undefined,
        sameAs: [p.instagramUrl, p.youtubeUrl, p.portfolioUrl, p.googleBusinessUrl].filter(Boolean),
        hasMap: p.googleMapsUrl ?? undefined,
        mainEntityOfPage: { "@id": `${pageUrl}#webpage` },
        hasOfferCatalog:
          packages.length > 0
            ? {
                "@type": "OfferCatalog",
                name: `${p.studioName} pre-wedding packages`,
                itemListElement: packages.map((k) => ({
                  "@type": "Offer",
                  name: k.name,
                  price: k.offerPrice ?? k.actualPrice,
                  priceCurrency: "INR",
                  itemOffered: { "@type": "Service", name: k.name, serviceType: "Pre-wedding photography" },
                })),
              }
            : undefined,
      },
      {
        "@type": "ProfilePage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: seo.title,
        description: seo.description,
        inLanguage: "en-IN",
        dateCreated: p.createdAt,
        about: { "@id": `${pageUrl}#business` },
        isPartOf: websiteRef(),
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      },
      buildBreadcrumbNode(pageUrl, breadcrumbs),
      buildFaqPage(seo.faqs, pageUrl),
    ].filter((node) => node !== null));

  return (
    <div>
      <section className="relative overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800 pt-12 pb-24 sm:pt-16 sm:pb-28">
        {p.bannerUrl && (
          <>
            <Image src={p.bannerUrl} alt={`${p.studioName} pre-wedding photography in ${p.city}`} fill priority sizes="100vw" className="object-cover" />
            <div aria-hidden="true" className="absolute inset-0 bg-black/45" />
          </>
        )}
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
            <div className="relative size-32 shrink-0 overflow-hidden rounded-full bg-white/10 ring-4 ring-white/30 sm:size-40">
              {p.logoUrl ?? p.avatarUrl ? (
                <Image src={(p.logoUrl ?? p.avatarUrl)!} alt={`${p.studioName} logo`} fill sizes="160px" priority className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Camera className="size-12 text-white/70" strokeWidth={1.25} />
                </div>
              )}
            </div>
            <div>
              <h1 className="font-heading flex items-center justify-center gap-2 text-3xl font-semibold text-white sm:justify-start sm:text-4xl">
                {seo.h1}
                {p.isVerified && <VerifiedBadge className="size-7" />}
              </h1>
              <p className="mt-1 text-lg text-white/85">by {p.displayName}</p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-white/80 sm:justify-start">
                <MapPin className="size-4" />
                <Link href={cityPath} className="hover:underline">
                  {p.city}
                </Link>
                , {p.state.name}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border bg-white p-4 shadow-lg">
          {p.hasPhone && <ContactRevealButton target={{ kind: "profile", slug: p.slug }} channel="call" label="Call Now" />}
          {p.hasWhatsapp && (
            <ContactRevealButton
              target={{ kind: "profile", slug: p.slug }}
              channel="whatsapp"
              label="WhatsApp"
              variant="outline"
            />
          )}
          {p.instagramUrl && (
            <Button variant="outline" render={<a href={p.instagramUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <Camera className="size-4" /> Instagram
            </Button>
          )}
          {p.youtubeUrl && (
            <Button variant="outline" render={<a href={p.youtubeUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <YoutubeIcon className="size-4" /> YouTube
            </Button>
          )}
          {p.portfolioUrl && (
            <Button variant="outline" render={<a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <Globe className="size-4" /> Portfolio
            </Button>
          )}
          {p.googleBusinessUrl && (
            <Button variant="outline" render={<a href={p.googleBusinessUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <Store className="size-4" /> Google Business
            </Button>
          )}
          {p.googleMapsUrl && (
            <Button variant="outline" render={<a href={p.googleMapsUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <MapPin className="size-4" /> Google Maps
            </Button>
          )}
          <ShareButton size="default" title={`${p.studioName} — Pre-Wedding Photographer`} url={absoluteUrl(`/photographers/p/${p.slug}`)} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        {PACKAGE_TYPES.map((type) => {
          const ofType = packages.filter((pkg) => pkg.packageType === type);
          if (ofType.length === 0) return null;
          return (
            <section key={type} className="mt-10">
              <h2 className="font-heading mb-5 text-2xl font-semibold">{PACKAGE_TYPE_LABEL[type]}</h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {ofType.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            </section>
          );
        })}

        <div className="mt-12 grid grid-cols-1 gap-8 border-t pt-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <section>
              <h2 className="font-heading mb-3 text-xl font-semibold">About {p.studioName}</h2>
              <p className="leading-relaxed text-foreground/90">{seo.summary}</p>
              {p.bio && <p className="mt-3 leading-relaxed whitespace-pre-line text-foreground/90">{p.bio}</p>}
            </section>

            {p.services.length > 0 && (
              <section className="mt-8">
                <h2 className="font-heading mb-3 text-xl font-semibold">Services</h2>
                <div className="flex flex-wrap gap-2">
                  {p.services.map((service) => (
                    <span key={service} className="rounded-full bg-pb-brand/10 px-3.5 py-1.5 text-sm font-medium text-pb-brand">
                      {service}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {seo.faqs.length > 0 && (
              <section className="mt-8">
                <h2 className="font-heading mb-3 text-xl font-semibold">
                  Frequently asked questions about {p.studioName}
                </h2>
                <dl className="flex flex-col gap-4">
                  {seo.faqs.map((faq) => (
                    <div key={faq.question}>
                      <dt className="font-medium">{faq.question}</dt>
                      <dd className="mt-1 text-foreground/90">{faq.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-heading mb-4 text-lg font-semibold">At a glance</h2>
            {facts.length > 0 && (
              <dl className="flex flex-col gap-4">
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-pb-brand" />
                    <div>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-medium">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            )}
            <div className={`flex flex-col gap-2 ${facts.length > 0 ? "mt-5 border-t pt-5" : ""}`}>
              {p.hasPhone && <ContactRevealButton target={{ kind: "profile", slug: p.slug }} channel="call" label="Call Now" />}
              {p.hasWhatsapp && (
                <ContactRevealButton
                  target={{ kind: "profile", slug: p.slug }}
                  channel="whatsapp"
                  label="WhatsApp"
                  className="bg-[#25D366] text-white hover:bg-[#1fb857]"
                />
              )}
              <ShareButton title={`${p.studioName} — Pre-Wedding Photographer`} url={absoluteUrl(`/photographers/p/${p.slug}`)} />
            </div>
          </aside>
        </div>

        {sameCity.length > 0 && (
          <section className="mt-12 border-t pt-8">
            <h2 className="font-heading mb-4 text-xl font-semibold">More photographers in {p.state.name}</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {sameCity.map((other) => (
                <PhotographerCard key={other.id} photographer={other} />
              ))}
            </div>
          </section>
        )}
      </div>

      <JsonLd data={jsonLd} />
    </div>
  );
}

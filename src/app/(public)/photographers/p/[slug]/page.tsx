import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Camera, Globe, Languages, MapPin, MessageCircle, Phone, Plane, Wallet, Award } from "lucide-react";
import { getPublicPhotographerBySlug, getPublicPhotographerPackages, getPublicPhotographers } from "@/lib/public-data";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABEL } from "@/lib/photographer-options";
import { PackageCard } from "@/components/public/package-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { PhotographerCard } from "@/components/public/photographer-card";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/format";
import { DEFAULT_OG_IMAGE, absoluteUrl, buildBreadcrumbList, socialImageUrl } from "@/lib/jsonld";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicPhotographerBySlug(slug);
  if (!p) return {};

  const title = `${p.studioName} — Pre-Wedding Photographer in ${p.city}`;
  const description =
    p.bio?.slice(0, 155) ||
    `${p.studioName} by ${p.displayName} — pre-wedding photography in ${p.city}, ${p.state.name}. View services, experience and contact details.`;
  const path = `/photographers/p/${p.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "profile",
      images: [p.avatarUrl ? socialImageUrl(p.avatarUrl) : DEFAULT_OG_IMAGE],
    },
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: p.studioName,
    url: absoluteUrl(path),
    description: p.bio ?? undefined,
    image: p.avatarUrl ?? undefined,
    founder: { "@type": "Person", name: p.displayName },
    areaServed: p.city,
    address: { "@type": "PostalAddress", addressLocality: p.city, addressRegion: p.state.name, addressCountry: p.country.name },
    knowsLanguage: p.languages.length > 0 ? p.languages : undefined,
    sameAs: [p.instagramUrl, p.portfolioUrl].filter(Boolean),
    makesOffer: p.services.map((service) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: service } })),
  };

  return (
    <div>
      <section className="relative bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800 pt-12 pb-24 sm:pt-16 sm:pb-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
            <div className="relative size-32 shrink-0 overflow-hidden rounded-full bg-white/10 ring-4 ring-white/30 sm:size-40">
              {p.avatarUrl ? (
                <Image src={p.avatarUrl} alt={p.displayName} fill sizes="160px" priority className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Camera className="size-12 text-white/70" strokeWidth={1.25} />
                </div>
              )}
            </div>
            <div>
              <h1 className="font-heading text-3xl font-semibold text-white sm:text-4xl">{p.studioName}</h1>
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
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border bg-white p-4 shadow-lg sm:justify-start">
          {p.phoneNumber && (
            <Button render={<a href={`tel:${p.phoneNumber.replace(/[^\d+]/g, "")}`} />}>
              <Phone className="size-4" /> Call
            </Button>
          )}
          {p.whatsappNumber && (
            <Button
              variant="outline"
              render={<a href={buildWhatsAppLink(p.whatsappNumber)} target="_blank" rel="noopener noreferrer" />}
            >
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          )}
          {p.instagramUrl && (
            <Button variant="outline" render={<a href={p.instagramUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <Camera className="size-4" /> Instagram
            </Button>
          )}
          {p.portfolioUrl && (
            <Button variant="outline" render={<a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow" />}>
              <Globe className="size-4" /> Portfolio
            </Button>
          )}
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
            {p.bio && (
              <section>
                <h2 className="font-heading mb-3 text-xl font-semibold">About {p.studioName}</h2>
                <p className="leading-relaxed whitespace-pre-line text-foreground/90">{p.bio}</p>
              </section>
            )}

            {p.services.length > 0 && (
              <section className={p.bio ? "mt-8" : ""}>
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
          </div>

          {facts.length > 0 && (
            <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-heading mb-4 text-lg font-semibold">At a glance</h2>
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
            </aside>
          )}
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
      <JsonLd data={buildBreadcrumbList(breadcrumbs)} />
    </div>
  );
}

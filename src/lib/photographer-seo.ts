import type { PublicPhotographer } from "./public-data";
import type { PhotographerPackage } from "./photographer-options";

/** Root layout appends " | PhotoBlinks" to every title. */
const TITLE_SUFFIX_LENGTH = " | PhotoBlinks".length;
const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 158;

const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:\s-]+$/, "")}…`;
}

export type PhotographerFaq = { question: string; answer: string };

export type PhotographerSeo = {
  title: string;
  h1: string;
  description: string;
  /** One factual, self-contained paragraph (what/where/price/experience) that
   * AI answer engines can quote verbatim. */
  summary: string;
  faqs: PhotographerFaq[];
};

/** Auto-generated defaults for a photographer's on-page SEO. Admin-set
 * seo_title / seo_h1 / seo_description always win; blank fields fall back to
 * these, so every imported draft is optimized without manual work. Only facts
 * actually stored on the profile are used — nothing invented. */
export function buildPhotographerSeo(p: PublicPhotographer, packages: PhotographerPackage[]): PhotographerSeo {
  const where = `${p.city}, ${p.state.name}`;
  const minPrice =
    p.startingPrice ??
    (packages.length > 0 ? Math.min(...packages.map((k) => k.offerPrice ?? k.actualPrice)) : null);

  const titleMax = MAX_TITLE_LENGTH - TITLE_SUFFIX_LENGTH;
  const titleCandidates = [
    `${p.studioName} – Pre-Wedding Photographer in ${p.city}`,
    `${p.studioName} – ${p.city} Pre-Wedding Photographer`,
    `${p.studioName} – Pre-Wedding Photographer`,
  ];
  const title = p.seoTitle || titleCandidates.find((t) => t.length <= titleMax) || clip(p.studioName, titleMax);

  const h1 = p.seoH1 || `${p.studioName} – Pre-Wedding Photographer in ${p.city}`;

  const topServices = p.services.slice(0, 3).map((s) => s.toLowerCase());
  const facts = [
    `${p.studioName} by ${p.displayName} is a pre-wedding photographer in ${where}.`,
    topServices.length > 0 ? `Services include ${topServices.join(", ")}.` : "",
    p.experienceYears != null ? `${p.experienceYears}+ years of experience.` : "",
    minPrice != null ? `Packages start at ${rupees(minPrice)}.` : "",
    "View packages and contact on PhotoBlinks.",
  ].filter(Boolean);
  const generated = clip(facts.join(" "), MAX_DESCRIPTION_LENGTH);
  const description = p.seoDescription || generated;

  const summaryParts = [
    `${p.studioName} is a pre-wedding photography studio run by ${p.displayName} in ${where}, ${p.country.name}.`,
    p.services.length > 0 ? `It offers ${p.services.join(", ").toLowerCase()}.` : "",
    p.experienceYears != null
      ? `${p.displayName} has ${p.experienceYears} year${p.experienceYears === 1 ? "" : "s"} of experience.`
      : "",
    p.languages.length > 0 ? `Clients are served in ${p.languages.join(", ")}.` : "",
    minPrice != null ? `Pre-wedding packages start at ${rupees(minPrice)}.` : "",
  ].filter(Boolean);
  const summary = summaryParts.join(" ");

  const faqs: PhotographerFaq[] = [
    {
      question: `Where is ${p.studioName} located?`,
      answer: `${p.studioName} is based in ${p.city}, ${p.state.name}, ${p.country.name}.${
        p.travelsToOtherCities ? " The team also travels to other cities for shoots." : ""
      }`,
    },
  ];
  if (p.services.length > 0) {
    faqs.push({
      question: `What services does ${p.studioName} offer?`,
      answer: `${p.studioName} offers ${p.services.join(", ").toLowerCase()}.`,
    });
  }
  if (packages.length > 0) {
    const list = packages
      .map((k) => `${k.name} (${rupees(k.offerPrice ?? k.actualPrice)})`)
      .join("; ");
    faqs.push({
      question: `How much does ${p.studioName} charge for a pre-wedding shoot in ${p.city}?`,
      answer: `Packages start at ${rupees(minPrice!)}. Available packages: ${list}.`,
    });
  } else if (minPrice != null) {
    faqs.push({
      question: `How much does ${p.studioName} charge for a pre-wedding shoot in ${p.city}?`,
      answer: `Pre-wedding packages start at ${rupees(minPrice)}.`,
    });
  }
  if (p.experienceYears != null) {
    faqs.push({
      question: `How experienced is ${p.studioName}?`,
      answer: `${p.displayName} has ${p.experienceYears} year${p.experienceYears === 1 ? "" : "s"} of photography experience.`,
    });
  }
  if (p.languages.length > 0) {
    faqs.push({
      question: `Which languages does ${p.studioName} speak?`,
      answer: `${p.studioName} works in ${p.languages.join(", ")}.`,
    });
  }
  if (p.phoneNumber || p.whatsappNumber) {
    faqs.push({
      question: `How can I book or contact ${p.studioName}?`,
      answer: `Call or WhatsApp ${p.studioName} directly using the contact buttons on this PhotoBlinks page.`,
    });
  }

  return { title, h1, description, summary, faqs };
}

import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Roboto, Manrope } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";

const GA_MEASUREMENT_ID = "G-GJEBVWSMWF";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Public-site brand fonts, scoped in via .pb-theme (globals.css) so the
// admin panel keeps Geist and is unaffected.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const DEFAULT_TITLE = "PhotoBlinks - Discover Photoshoot Locations";
const DEFAULT_DESCRIPTION = "Discover pre-wedding photoshoot locations across India.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | PhotoBlinks",
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: "PhotoBlinks",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "PhotoBlinks — Photoshoot Locations",
      },
    ],
  },
  // No title/description here on purpose: Next resolves an unset Twitter
  // field from the page's own effective `openGraph` value (already proven
  // for `images`, e.g. a location's real photo correctly flows through to
  // twitter:image). Hardcoding them to the site defaults here previously
  // meant every page's Twitter card showed the homepage's title/description
  // instead of its own — verified via a real build before this fix.
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${roboto.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </html>
  );
}

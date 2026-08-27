import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Roboto, Manrope } from "next/font/google";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-GJEBVWSMWF";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
const DEFAULT_DESCRIPTION = "Discover beautiful photoshoot locations across Karnataka and Kerala.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable} ${manrope.variable} h-full antialiased`}
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

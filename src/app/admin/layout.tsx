import type { Metadata } from "next";

// Applies to every /admin/* route (login included) via layout inheritance —
// keeps admin out of search results even though robots.txt already
// disallows /admin/, since crawlers that ignore robots.txt still respect
// a noindex meta tag on pages they do fetch.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

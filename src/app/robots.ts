import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Icons are served as /icon/<size>?<hash>; the longer Allow beats the
      // "/*?*" Disallow so Googlebot-Favicon can fetch them.
      allow: ["/", "/icon", "/apple-icon"],
      disallow: [
        "/admin/",
        "/api/",
        "/photographer/",
        "/c/",
        "/locations/search",
        "/favourites/share/",
        "/sign-in",
        "/sign-up",
        "/*?*",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

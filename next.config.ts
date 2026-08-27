import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The R2 public dev URL that serves every admin-uploaded image
    // (locations, studios, categories, countries, states, cities, site
    // banners) — see R2_PUBLIC_URL in .env.local / .env.production-backup.
    // Restricted to this exact hostname so only PhotoBlinks' own bucket can
    // be optimized, not arbitrary remote images.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-0f3ca40c378b41b2b74bb464f98f62e2.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

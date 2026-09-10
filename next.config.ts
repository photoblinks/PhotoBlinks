import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Images are optimized by Cloudflare Image Transformations (see
    // src/lib/cf-image-loader.ts), not Vercel's built-in /_next/image
    // endpoint — this avoids Vercel's image-optimization usage limits.
    loader: "custom",
    loaderFile: "./src/lib/cf-image-loader.ts",
    // Kept for documentation/allow-list intent even though a custom loader
    // bypasses next/image's own remotePatterns check: the R2 public dev URL
    // that serves every admin-uploaded image (locations, studios,
    // categories, countries, states, cities, site banners) — see
    // R2_PUBLIC_URL in .env.local / .env.production-backup — plus the R2
    // custom domain the loader rewrites requests to.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-0f3ca40c378b41b2b74bb464f98f62e2.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.photoblinks.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

// Fixed, allowlisted brand icons for the social platforms the admin can
// configure in Admin → Settings → Social Media.
//
// The project's icon library (lucide-react) no longer ships brand icons —
// Instagram, Facebook, Youtube, Pinterest and Linkedin were removed from
// Lucide — so these small glyphs are inlined SVG strokes here,
// dependency-free and consistent with the rest of the footer icons.
//
// The platform → component map must stay a hardcoded literal keyed by the
// closed `SocialPlatform` union from @/lib/public-data: database values can
// never resolve arbitrary component names, and adding a platform is a
// deliberate source change, never a data-driven lookup.

import type { SocialPlatform } from "@/lib/public-data";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="7" y="3.5" width="10" height="17" rx="2.6" />
      <circle cx="14.6" cy="8.6" r="2.3" />
      <line x1="8.8" y1="14.6" x2="15.2" y2="14.6" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8.5 4.5h8" />
      <path d="M8.5 4.5v15.5" />
      <path d="M8.5 20h4" />
      <circle cx="8.4" cy="14.4" r="4.4" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="8" y="5" width="11" height="13" rx="2.5" fill="none" />
      <path d="M12.5 9v6.5l4.5-3.25z" fill="currentColor" />
    </svg>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 4.5v16" />
      <circle cx="11" cy="11" r="5" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="5" y="5.5" width="14" height="13" rx="2.2" />
      <circle cx="9.5" cy="9" r="1" />
      <path d="M9.5 12v5.5" />
      <path d="M12.5 17.5v-5.5h3v5.5" />
    </svg>
  );
}

/** Explicit platform → icon mapping. Keyed by the closed SocialPlatform
 * union so a platform can only ever resolve to its hardcoded icon here. */
export const SOCIAL_PLATFORM_ICONS: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  youtube: YoutubeIcon,
  pinterest: PinterestIcon,
  linkedin: LinkedinIcon,
};

/** Human-readable platform names, used for accessible link aria-labels. */
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
};
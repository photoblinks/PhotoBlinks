import { PERMISSION } from "@/lib/supabase/require-permission";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  /** Admin-only unless set; employees need any one of these. */
  permissions?: readonly string[];
  /** Shown to every admin and active employee. */
  allStaff?: boolean;
};

export type AdminNavSection = { key: string; label: string; description: string; items: AdminNavItem[] };

/** Admin sidebar structure: the sidebar lists the sections only; a section
 * with several visible items opens a hub page showing each item as a box.
 * Hiding an item is a convenience — the page/action guards and RLS enforce
 * access. */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Site overview.",
    items: [{ href: "/admin", label: "Dashboard", description: "Totals and recent activity." }],
  },
  {
    key: "locations",
    label: "Locations",
    description: "Photoshoot locations and their landing pages.",
    items: [
      { href: "/admin/locations", label: "Locations", description: "Add, edit and publish locations.", permissions: [PERMISSION.LOCATIONS_EDIT, PERMISSION.LOCATIONS_PUBLISH] },
      { href: "/admin/locations/bulk-import", label: "Bulk Import", description: "Import many locations at once.", permissions: [PERMISSION.LOCATIONS_EDIT] },
      { href: "/admin/categories", label: "Categories", description: "Beach, temple, waterfall and other categories." },
      { href: "/admin/location-reports", label: "Location Reports", description: "Review reports sent by visitors." },
      { href: "/admin/country-pages", label: "Country Pages", description: "Banner, heading and SEO for country pages." },
      { href: "/admin/state-pages", label: "State Pages", description: "Banner, heading and SEO for state pages." },
      { href: "/admin/city-pages", label: "City Pages", description: "Banner, heading, SEO, blog and quick facts for city pages." },
      { href: "/admin/editorial", label: "Editorial Content", description: "Blog sections on state and category pages." },
      { href: "/admin/seo/location-categories", label: "Location + Category SEO", description: "SEO for city + category pages." },
      { href: "/admin/seo/location-state-categories", label: "State + Category SEO", description: "SEO for state + category pages." },
    ],
  },
  {
    key: "studios",
    label: "Studios",
    description: "Preset and studio venues.",
    items: [
      { href: "/admin/studios", label: "Studios", description: "Add, edit and publish studios.", permissions: [PERMISSION.STUDIOS_EDIT, PERMISSION.STUDIOS_PUBLISH] },
    ],
  },
  {
    key: "photographers",
    label: "Photographers",
    description: "Photographer accounts, photos and pages.",
    items: [
      { href: "/admin/photographer-requests", label: "Requests", description: "Approve new photographer sign-ups." },
      { href: "/admin/photographer-profiles", label: "Profiles", description: "Edit profiles, verified tick and SEO." },
      { href: "/admin/photographer-photos", label: "Photos", description: "Approve or reject submitted photos." },
      { href: "/admin/photographers", label: "Sponsored", description: "Sponsored photographer placements." },
      { href: "/admin/photographer-state-seo", label: "State SEO", description: "Title, banner and blog for photographer state pages." },
      { href: "/admin/photographer-city-seo", label: "City SEO", description: "Title, banner and blog for photographer city pages." },
    ],
  },
  {
    key: "content",
    label: "Content",
    description: "Blog and visitor comments.",
    items: [
      { href: "/admin/blog", label: "Blog", description: "Write and publish blog posts." },
      { href: "/admin/editors", label: "Editors", description: "Author profiles shown on blogs and content (E-E-A-T)." },
      { href: "/admin/comments", label: "Comments", description: "Moderate visitor comments." },
    ],
  },
  {
    key: "people",
    label: "People",
    description: "Users and staff.",
    items: [
      { href: "/admin/users", label: "Users", description: "Registered visitors." },
      { href: "/admin/employees", label: "Employees", description: "Staff accounts and roles." },
      { href: "/admin/activity", label: "Employee Activity", description: "What staff changed and when.", permissions: [PERMISSION.ACTIVITY_VIEW] },
      { href: "/admin/performance", label: "Employee Performance", description: "Staff output summary.", allStaff: true },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    description: "Site settings.",
    items: [{ href: "/admin/settings", label: "Settings", description: "Banners, social links and site settings." }],
  },
];

type Staff = { isAdmin: boolean; canAny: (permissions: readonly string[]) => boolean };

export function isNavItemVisible(item: AdminNavItem, staff: Staff) {
  return item.allStaff || (item.permissions ? staff.canAny(item.permissions) : staff.isAdmin);
}

/** Sections with at least one item the staff member can see. */
export function getVisibleNavSections(staff: Staff) {
  return ADMIN_NAV_SECTIONS.flatMap((section) => {
    const items = section.items.filter((item) => isNavItemVisible(item, staff));
    return items.length > 0 ? [{ ...section, items }] : [];
  });
}

/** Single-item sections link straight to the page; the rest open the hub. */
export function navSectionHref(section: { key: string; items: { href: string }[] }) {
  return section.items.length === 1 ? section.items[0].href : `/admin/section/${section.key}`;
}

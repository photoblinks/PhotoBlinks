import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";

// Links without `permissions` are admin-only; links with them are also shown
// to employees whose active role grants any of those permissions. `allStaff`
// links are shown to every admin and every active employee. This mirrors the
// server-side guards on each page — hiding a link is only a convenience, the
// real enforcement happens in the page/action guards and RLS.
const NAV_LINKS: {
  href: string;
  label: string;
  permissions?: readonly string[];
  allStaff?: boolean;
}[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/activity", label: "Employee Activity", permissions: [PERMISSION.ACTIVITY_VIEW] },
  { href: "/admin/performance", label: "Employee Performance", allStaff: true },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/locations", label: "Locations", permissions: [PERMISSION.LOCATIONS_EDIT, PERMISSION.LOCATIONS_PUBLISH] },
  { href: "/admin/studios", label: "Studios", permissions: [PERMISSION.STUDIOS_EDIT, PERMISSION.STUDIOS_PUBLISH] },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/photographers", label: "Sponsored Photographers" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/photographer-photos", label: "Photographer Photos" },
  { href: "/admin/location-reports", label: "Location Reports" },
  { href: "/admin/country-pages", label: "Country Pages" },
  { href: "/admin/state-pages", label: "State Pages" },
  { href: "/admin/city-pages", label: "City Pages" },
  { href: "/admin/seo/location-categories", label: "Location + Category SEO" },
  { href: "/admin/seo/location-state-categories", label: "State + Category SEO" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");

  const visibleLinks = NAV_LINKS.filter(
    (link) =>
      link.allStaff || (link.permissions ? staff.canAny(link.permissions) : staff.isAdmin),
  );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">PhotoBlinks</div>
        <nav className="flex flex-1 flex-col gap-1">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <span className="truncate px-2 text-xs text-muted-foreground">{staff.user.email}</span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

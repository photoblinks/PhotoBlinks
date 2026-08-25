import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/studios", label: "Studios" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">PhotoBlinks</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_LINKS.map((link) => (
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
          <span className="truncate px-2 text-xs text-muted-foreground">{user?.email}</span>
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

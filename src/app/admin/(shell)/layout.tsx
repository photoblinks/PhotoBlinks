import { redirect } from "next/navigation";
import { getAuthorizedStaffUser } from "@/lib/supabase/require-permission";
import { getVisibleNavSections, navSectionHref } from "@/lib/admin-nav";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { logout } from "../login/actions";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");

  const sections = getVisibleNavSections(staff).map((section) => ({
    key: section.key,
    label: section.label,
    href: navSectionHref(section),
    itemHrefs: section.items.map((item) => item.href),
  }));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">PhotoBlinks</div>
        <AdminNav
          sections={sections}
          showBadges={staff.isAdmin}
        />
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <span className="truncate px-2 text-xs text-muted-foreground">{staff.user.email}</span>
          <form action={logout}>
            <AuthSubmitButton label="Log out" pendingLabel="Logging out…" variant="outline" size="sm" />
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

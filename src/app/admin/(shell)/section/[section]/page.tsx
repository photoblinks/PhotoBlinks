import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizedStaffUser } from "@/lib/supabase/require-permission";
import { getVisibleNavSections } from "@/lib/admin-nav";
import { getNavBadgeCounts } from "../../nav-badges-actions";

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");

  const { section: key } = await params;
  const section = getVisibleNavSections(staff).find((s) => s.key === key);
  if (!section) notFound();

  const counts = staff.isAdmin ? await getNavBadgeCounts() : {};

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{section.label}</h1>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item) => {
          const count = counts[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col gap-1.5 rounded-xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-pb-brand/40 hover:shadow-md"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {item.label}
                {count > 0 && (
                  <span
                    aria-label={`${count} new`}
                    className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-medium text-white"
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">{item.description}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

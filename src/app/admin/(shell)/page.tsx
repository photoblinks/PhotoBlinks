import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  // The overview dashboard is admin-only. An employee lands here right after
  // login, so bounce them to their first permitted module instead of showing
  // admin-facing counts (which, under RLS, would only reflect published rows).
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");
  if (!staff.isAdmin) {
    if (staff.canAny([PERMISSION.LOCATIONS_EDIT, PERMISSION.LOCATIONS_PUBLISH])) redirect("/admin/locations");
    if (staff.canAny([PERMISSION.STUDIOS_EDIT, PERMISSION.STUDIOS_PUBLISH])) redirect("/admin/studios");
    if (staff.can(PERMISSION.ACTIVITY_VIEW)) redirect("/admin/activity");
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your account has no module access yet. Contact an administrator to assign a role.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [
    { count: totalLocations },
    { count: totalCategories },
    { count: totalStudios },
    { count: freeLocations },
    { count: paidLocations },
    { count: unknownLocations },
  ] = await Promise.all([
    supabase.from("locations").select("*", { count: "exact", head: true }),
    supabase.from("categories").select("*", { count: "exact", head: true }),
    supabase.from("studios").select("*", { count: "exact", head: true }),
    supabase.from("locations").select("*", { count: "exact", head: true }).eq("pricing_type", "free"),
    supabase.from("locations").select("*", { count: "exact", head: true }).eq("pricing_type", "paid"),
    supabase.from("locations").select("*", { count: "exact", head: true }).eq("pricing_type", "unknown"),
  ]);

  const stats = [
    { label: "Total Locations", value: totalLocations ?? 0 },
    { label: "Total Categories", value: totalCategories ?? 0 },
    { label: "Total Studios", value: totalStudios ?? 0 },
    { label: "Free Locations", value: freeLocations ?? 0 },
    { label: "Paid Locations", value: paidLocations ?? 0 },
    { label: "Unknown-Price Locations", value: unknownLocations ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{stat.value}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

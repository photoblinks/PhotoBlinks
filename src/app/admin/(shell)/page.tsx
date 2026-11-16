import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Stat = { label: string; value: number };

function StatSection({ title, stats }: { title: string; stats: Stat[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{stat.value}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");

  // Each section shows only for modules the staff member can access. RLS
  // returns every row to holders of the edit/publish permissions, so the
  // counts match what admins see.
  const showLocations = staff.canAny([PERMISSION.LOCATIONS_EDIT, PERMISSION.LOCATIONS_PUBLISH]);
  const showStudios = staff.canAny([PERMISSION.STUDIOS_EDIT, PERMISSION.STUDIOS_PUBLISH]);
  const showPhotographers = staff.canAny([PERMISSION.PHOTOGRAPHERS_EDIT, PERMISSION.PHOTOGRAPHERS_PUBLISH]);

  if (!staff.isAdmin && !showLocations && !showStudios && !showPhotographers) {
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
  const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;
  const locations = () => supabase.from("locations").select("*", { count: "exact", head: true });
  const photographers = async (status: string | null) => {
    const { data } = await supabase.rpc("get_admin_photographer_profiles_count", { p_status: status, p_search: null });
    return Number(data ?? 0);
  };

  const [locationStats, studioStats, categoryStats, photographerStats] = await Promise.all([
    showLocations
      ? Promise.all([
          count(locations()),
          count(locations().eq("pricing_type", "free")),
          count(locations().eq("pricing_type", "paid")),
          count(locations().eq("pricing_type", "unknown")),
        ])
      : null,
    showStudios ? count(supabase.from("studios").select("*", { count: "exact", head: true })) : null,
    staff.isAdmin ? count(supabase.from("categories").select("*", { count: "exact", head: true })) : null,
    showPhotographers
      ? Promise.all([photographers(null), photographers("active"), photographers("draft"), photographers("on_hold")])
      : null,
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      {locationStats && (
        <StatSection
          title="Locations"
          stats={[
            { label: "Total Locations", value: locationStats[0] },
            { label: "Free Locations", value: locationStats[1] },
            { label: "Paid Locations", value: locationStats[2] },
            { label: "Unknown-Price Locations", value: locationStats[3] },
            ...(categoryStats !== null ? [{ label: "Total Categories", value: categoryStats }] : []),
          ]}
        />
      )}
      {studioStats !== null && <StatSection title="Studios" stats={[{ label: "Total Studios", value: studioStats }]} />}
      {photographerStats && (
        <StatSection
          title="Photographers"
          stats={[
            { label: "Total Photographers", value: photographerStats[0] },
            { label: "Active", value: photographerStats[1] },
            { label: "Drafts", value: photographerStats[2] },
            { label: "Pending Requests", value: photographerStats[3] },
          ]}
        />
      )}
    </div>
  );
}

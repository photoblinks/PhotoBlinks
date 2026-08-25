import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
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

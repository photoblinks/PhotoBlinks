import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageStatsRow = {
  page_path: string;
  location_id: string | null;
  impressions: number;
  call_clicks: number;
  whatsapp_clicks: number;
};

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "all", label: "All time", days: null },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-heading mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default async function PhotographerAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  const { range: rangeParam } = await searchParams;
  const range: RangeValue = RANGE_OPTIONS.some((r) => r.value === rangeParam)
    ? (rangeParam as RangeValue)
    : "all";

  const supabase = await createClient();

  const { data: photographer } = await supabase
    .from("sponsored_photographers")
    .select("id, photography_name, expiry_date, states(name)")
    .eq("id", id)
    .maybeSingle();

  if (!photographer) notFound();

  const stateName = (Array.isArray(photographer.states) ? photographer.states[0] : photographer.states)
    ?.name;

  const selectedRange = RANGE_OPTIONS.find((r) => r.value === range)!;
  const since = selectedRange.days
    ? new Date(new Date().getTime() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: pageStats } = await supabase.rpc("get_sponsored_photographer_page_stats", {
    p_photographer_id: id,
    p_since: since,
  });
  const rows = (pageStats ?? []) as PageStatsRow[];

  // One bulk lookup for display names, not one query per row — the
  // breakdown itself is already a single aggregate query (see the
  // get_sponsored_photographer_page_stats function).
  const locationIds = [...new Set(rows.map((r) => r.location_id).filter((v): v is string => v !== null))];
  const { data: locationNames } =
    locationIds.length > 0
      ? await supabase.from("locations").select("id, name").in("id", locationIds)
      : { data: [] as { id: string; name: string }[] };
  const nameByLocationId = new Map((locationNames ?? []).map((l) => [l.id, l.name]));

  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      callClicks: acc.callClicks + row.call_clicks,
      whatsappClicks: acc.whatsappClicks + row.whatsapp_clicks,
    }),
    { impressions: 0, callClicks: 0, whatsappClicks: 0 },
  );
  const totalLeads = totals.callClicks + totals.whatsappClicks;
  const leadRate = totals.impressions > 0 ? (totalLeads / totals.impressions) * 100 : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const isActive = photographer.expiry_date >= todayIso;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Sponsored Photographer Analytics</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{photographer.photography_name}</span>
          <span>·</span>
          <span>{stateName ?? "—"}</span>
          <span>·</span>
          <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Active" : "Expired"}</Badge>
          <span className="text-xs">Expires {photographer.expiry_date}</span>
        </div>
      </div>

      <div className="mb-6 flex gap-1">
        {RANGE_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={`/admin/photographers/${id}/analytics?range=${option.value}`}
            aria-current={option.value === range ? "true" : undefined}
            className={
              option.value === range
                ? "rounded-full bg-pb-brand px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Impressions" value={totals.impressions.toLocaleString()} />
        <StatCard label="Call Clicks" value={totals.callClicks.toLocaleString()} />
        <StatCard label="WhatsApp Clicks" value={totals.whatsappClicks.toLocaleString()} />
        <StatCard label="Total Leads" value={totalLeads.toLocaleString()} />
      </div>

      {leadRate !== null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Lead rate: <span className="font-medium text-foreground">{leadRate.toFixed(1)}%</span>{" "}
          <span className="text-xs">(total leads ÷ impressions)</span>
        </p>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Performance by page</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No analytics data yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page / Location</TableHead>
              <TableHead>Impressions</TableHead>
              <TableHead>Calls</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Total Leads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.page_path}>
                <TableCell className="font-medium">
                  {row.location_id ? (nameByLocationId.get(row.location_id) ?? row.page_path) : row.page_path}
                </TableCell>
                <TableCell>{row.impressions.toLocaleString()}</TableCell>
                <TableCell>{row.call_clicks.toLocaleString()}</TableCell>
                <TableCell>{row.whatsapp_clicks.toLocaleString()}</TableCell>
                <TableCell>{(row.call_clicks + row.whatsapp_clicks).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

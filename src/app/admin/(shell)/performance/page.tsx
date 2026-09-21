import { createClient } from "@/lib/supabase/server";
import { checkAdmin, requireStaffPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardFilters } from "./dashboard-filters";

type TopEntry = { entity_id: string; name: string; count: number };

type StatsRow = {
  user_id: string;
  display_name: string;
  total_locations_added: number | string | null;
  total_studios_added: number | string | null;
  total_activity_days: number | string | null;
  top_locations: unknown;
  top_studios: unknown;
};

type DailyRow = {
  activity_date: string;
  locations_added: number | string | null;
  studios_added: number | string | null;
  total_activities: number | string | null;
};

type RoleRow = { user_id: string; employee_roles: { name: string } | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The daily-activity RPC returns one row per day with no pagination, so cap
 * the selectable window to keep the table (and query) bounded. */
const MAX_RANGE_DAYS = 366;

function num(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

/** Today as YYYY-MM-DD in Asia/Kolkata - the calendar the activity RPCs bucket
 * every date by (en-CA formats as YYYY-MM-DD). */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Normalizes one jsonb entry of the stats RPC's top_locations/top_studios
 * lists. The RPC falls back to the raw entity id as the name when the event
 * metadata carried none (e.g. deleted or never-named entities). */
function parseTopEntries(raw: unknown): TopEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: TopEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.entity_id !== "string") continue;
    entries.push({
      entity_id: record.entity_id,
      name:
        typeof record.name === "string" && record.name.trim() && record.name !== record.entity_id
          ? record.name
          : "Unnamed entry",
      count: num(record.count as number | string | null | undefined),
    });
  }
  return entries;
}

/** Team-wide top 5 when no single employee is selected: merges each employee's
 * per-entity counts from the stats RPC's existing top lists - no second
 * backend aggregation is added. */
function aggregateTopEntries(
  rows: StatsRow[],
  key: "top_locations" | "top_studios",
): TopEntry[] {
  const totals = new Map<string, TopEntry>();
  for (const row of rows) {
    for (const entry of parseTopEntries(row[key])) {
      const prev = totals.get(entry.entity_id);
      totals.set(entry.entity_id, {
        entity_id: entry.entity_id,
        name: entry.name,
        count: (prev?.count ?? 0) + entry.count,
      });
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

/** The performance RPCs return names only. Roles live in the employees table,
 * whose SELECT policy is admin-only, so the lookup runs for admin viewers -
 * employee viewers simply get "-" instead of a query RLS will reject. */
async function fetchEmployeeRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isAdmin: boolean,
): Promise<{ data: RoleRow[] | null; error: { message: string } | null }> {
  if (!isAdmin) return { data: null, error: null };
  const { data, error } = await supabase
    .from("employees")
    .select("user_id, employee_roles(name)")
    .eq("is_active", true);
  return { data: (data as RoleRow[] | null) ?? null, error };
}

function TopCard({
  title,
  description,
  entries,
  emptyLabel,
}: {
  title: string;
  description?: string;
  entries: TopEntry[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry, index) => (
              <li key={entry.entity_id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  <span className="mr-1.5 text-xs text-muted-foreground">{index + 1}.</span>
                  {entry.name}
                </span>
                <Badge variant="secondary">{entry.count}</Badge>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default async function EmployeePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; from?: string; to?: string }>;
}) {
  await requireStaffPage();

  const { employee: employeeParam, from: fromParam, to: toParam } = await searchParams;

  // Defaults: the current Asia/Kolkata calendar month. All range math uses UTC
  // on YYYY-MM-DD strings - the values are IST calendar days by design.
  const today = istToday();
  const defaultFrom = `${today.slice(0, 8)}01`;
  let from = fromParam && isValidDateString(fromParam) ? fromParam : defaultFrom;
  let to = toParam && isValidDateString(toParam) ? toParam : today;
  if (from > to) [from, to] = [to, from];

  let rangeClamped = false;
  const spanDays = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  if (spanDays > MAX_RANGE_DAYS - 1) {
    to = new Date(Date.parse(`${from}T00:00:00Z`) + (MAX_RANGE_DAYS - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    rangeClamped = true;
  }

  const employeeId = employeeParam && UUID_RE.test(employeeParam) ? employeeParam : null;

  const supabase = await createClient();
  const { ok: isAdmin } = await checkAdmin(supabase);

  const [statsResult, dailyResult, roleResult] = await Promise.all([
    supabase.rpc("get_employee_performance_stats", {
      p_employee_id: null,
      p_from: from,
      p_to: to,
    }),
    supabase.rpc("get_employee_daily_activity", {
      p_employee_id: employeeId,
      p_from: from,
      p_to: to,
    }),
    fetchEmployeeRoles(supabase, isAdmin),
  ]);

  const statsError = statsResult.error;
  const dailyError = dailyResult.error;
  const statsRows = (statsResult.data ?? []) as StatsRow[];
  const dailyRows = (dailyResult.data ?? []) as DailyRow[];

  const roleByUser = new Map<string, string>();
  for (const row of roleResult.data ?? []) {
    if (row.employee_roles?.name) roleByUser.set(row.user_id, row.employee_roles.name);
  }

  // One stats call with p_employee_id = null feeds the dropdown, the overview
  // and the top lists; a selected employee is just filtered out of the rows.
  const selectedRows = employeeId
    ? statsRows.filter((row) => row.user_id === employeeId)
    : statsRows;
  const selectedName = selectedRows.length === 1 ? selectedRows[0].display_name : null;

  const topLocations = employeeId
    ? parseTopEntries(selectedRows[0]?.top_locations)
    : aggregateTopEntries(statsRows, "top_locations");
  const topStudios = employeeId
    ? parseTopEntries(selectedRows[0]?.top_studios)
    : aggregateTopEntries(statsRows, "top_studios");

  const employeeOptions = statsRows
    .map((row) => ({ id: row.user_id, name: row.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Employee Performance</h1>
        {rangeClamped && (
          <p className="mt-1 text-xs text-muted-foreground">
            Date range is limited to {MAX_RANGE_DAYS} days - showing {from} to {to}.
          </p>
        )}
      </div>

      <DashboardFilters
        basePath="/admin/performance"
        employees={employeeOptions}
        initial={{ employee: employeeId ?? undefined, from, to }}
        defaults={{ from: defaultFrom, to: today }}
      />

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">Employee overview</h2>
        {statsError ? (
          <p className="text-sm text-destructive">
            Could not load performance data. Please try again.
          </p>
        ) : selectedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {employeeId
              ? "This employee has no recorded activity in the selected period, or is no longer on the active list."
              : "No active employees yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Locations added</TableHead>
                <TableHead className="text-right">Studios added</TableHead>
                <TableHead className="text-right">Activity days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedRows.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell className="font-medium">{row.display_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {roleByUser.get(row.user_id) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{num(row.total_locations_added)}</TableCell>
                  <TableCell className="text-right">{num(row.total_studios_added)}</TableCell>
                  <TableCell className="text-right">{num(row.total_activity_days)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">
          Top contributions{selectedName ? ` — ${selectedName}` : " — all employees"}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TopCard
            title="Top 5 locations"
            description={
              selectedName ? undefined : "Aggregated from each employee's top contributions."
            }
            entries={topLocations}
            emptyLabel="No location activity recorded in the selected period."
          />
          <TopCard
            title="Top 5 studios"
            description={
              selectedName ? undefined : "Aggregated from each employee's top contributions."
            }
            entries={topStudios}
            emptyLabel="No studio activity recorded in the selected period."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Daily activity</h2>
        {dailyError ? (
          <p className="text-sm text-destructive">
            Could not load daily activity. Please try again.
          </p>
        ) : dailyRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity recorded in the selected period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Locations added</TableHead>
                <TableHead className="text-right">Studios added</TableHead>
                <TableHead className="text-right">Total activities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.map((row) => (
                <TableRow key={row.activity_date}>
                  <TableCell className="font-medium">{formatDay(row.activity_date)}</TableCell>
                  <TableCell className="text-right">{num(row.locations_added)}</TableCell>
                  <TableCell className="text-right">{num(row.studios_added)}</TableCell>
                  <TableCell className="text-right">{num(row.total_activities)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}




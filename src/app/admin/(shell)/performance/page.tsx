import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser } from "@/lib/supabase/require-permission";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Card,
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

type StatsRow = {
  user_id: string;
  display_name: string;
};

type DailyRow = {
  activity_date: string;
  locations_added: number | string | null;
  studios_added: number | string | null;
  total_added: number | string | null;
};

type SummaryRow = {
  user_id: string;
  display_name: string;
  range_locations_added: number | string | null;
  range_studios_added: number | string | null;
  range_total_added: number | string | null;
  week_start: string;
  week_end: string;
  week_locations_added: number | string | null;
  week_studios_added: number | string | null;
  week_total_added: number | string | null;
};

type SummaryTotals = {
  rangeLocations: number;
  rangeStudios: number;
  rangeTotal: number;
  weekLocations: number;
  weekStudios: number;
  weekTotal: number;
  weekStart: string;
  weekEnd: string;
};

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

/** Weekday name for a YYYY-MM-DD IST calendar day (the date string is a plain
 * calendar day, so it is parsed and formatted in UTC to avoid shifting it). */
function weekdayName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "long",
  });
}

/** Small stat tile used by the monthly and weekly summary card rows. Reuses
 * the existing Card primitives so the dashboard matches the rest of the admin
 * shell; zero activity renders as "0" rather than an empty value. `value`
 * accepts text so period-indicator cards can show a range instead of a count. */
function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

export default async function EmployeePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; from?: string; to?: string }>;
}) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) redirect("/admin/login");

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

  const [statsResult, dailyResult, summaryResult] = await Promise.all([
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
    supabase.rpc("get_employee_period_summary", {
      p_employee_id: employeeId,
      p_from: from,
      p_to: to,
    }),
  ]);

  const dailyError = dailyResult.error;
  const summaryError = summaryResult.error;
  const statsRows = (statsResult.data ?? []) as StatsRow[];
  const dailyRows = (dailyResult.data ?? []) as DailyRow[];
  const summaryRows = (summaryResult.data ?? []) as SummaryRow[];

  // One stats call with p_employee_id = null feeds the employee dropdown; a
  // selected employee is just filtered out of the rows.
  const selectedRows = employeeId
    ? statsRows.filter((row) => row.user_id === employeeId)
    : statsRows;
  const selectedName = selectedRows.length === 1 ? selectedRows[0].display_name : null;

  const employeeOptions = statsRows
    .map((row) => ({ id: row.user_id, name: row.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The summary RPC already returns one row per employee (or just the selected
  // one). When a single employee is selected the totals are their own row;
  // otherwise the per-employee rows are summed for the team view. Total Added
  // is summed from the component counts so it can never disagree with them.
  const summaryTotals = summaryRows.reduce<SummaryTotals>(
    (acc, row) => ({
      rangeLocations: acc.rangeLocations + num(row.range_locations_added),
      rangeStudios: acc.rangeStudios + num(row.range_studios_added),
      rangeTotal: acc.rangeTotal + num(row.range_total_added),
      weekLocations: acc.weekLocations + num(row.week_locations_added),
      weekStudios: acc.weekStudios + num(row.week_studios_added),
      weekTotal: acc.weekTotal + num(row.week_total_added),
      weekStart: row.week_start,
      weekEnd: row.week_end,
    }),
    {
      rangeLocations: 0,
      rangeStudios: 0,
      rangeTotal: 0,
      weekLocations: 0,
      weekStudios: 0,
      weekTotal: 0,
      weekStart: from,
      weekEnd: to,
    },
  );

  const weekLabel = `${formatDay(summaryTotals.weekStart)} - ${formatDay(summaryTotals.weekEnd)}`;
  const weekDays =
    Math.round(
      (Date.parse(`${summaryTotals.weekEnd}T00:00:00Z`) -
        Date.parse(`${summaryTotals.weekStart}T00:00:00Z`)) /
        86_400_000,
    ) + 1;

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
        showEmployeeFilter={staff.isAdmin}
        employees={employeeOptions}
        initial={{ employee: employeeId ?? undefined, from, to }}
        defaults={{ from: defaultFrom, to: today }}
      />

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">
          Summary - {formatDay(from)} to {formatDay(to)}
        </h2>
        {summaryError ? (
          <p className="text-sm text-destructive">
            Could not load summary totals. Please try again.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Total locations added" value={summaryTotals.rangeLocations} />
            <SummaryCard title="Total studios added" value={summaryTotals.rangeStudios} />
            <SummaryCard title="Total added" value={summaryTotals.rangeTotal} />
            <SummaryCard
              title="Selected period"
              value={<span className="text-lg">{`${formatDay(from)} - ${formatDay(to)}`}</span>}
              hint={`${num(spanDays) + 1} days`}
            />
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">
          This week{selectedName ? ` - ${selectedName}` : " - all employees"}
        </h2>
        {summaryError ? (
          <p className="text-sm text-destructive">
            Could not load weekly totals. Please try again.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Locations added this week" value={summaryTotals.weekLocations} />
            <SummaryCard title="Studios added this week" value={summaryTotals.weekStudios} />
            <SummaryCard title="Total added this week" value={summaryTotals.weekTotal} />
            <SummaryCard
              title="Week"
              value={<span className="text-lg">{weekLabel}</span>}
              hint={`${weekDays} ${weekDays === 1 ? "day" : "days"} (Mon–Sun, IST)`}
            />
          </div>
        )}
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
                <TableHead>Day</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Locations added</TableHead>
                <TableHead className="text-right">Studios added</TableHead>
                <TableHead className="text-right">Total added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.map((row) => (
                <TableRow key={row.activity_date}>
                  <TableCell className="text-muted-foreground">
                    {weekdayName(row.activity_date)}
                  </TableCell>
                  <TableCell className="font-medium">{formatDay(row.activity_date)}</TableCell>
                  <TableCell className="text-right">{num(row.locations_added)}</TableCell>
                  <TableCell className="text-right">{num(row.studios_added)}</TableCell>
                  <TableCell className="text-right">{num(row.total_added)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}




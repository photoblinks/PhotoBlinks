import { createClient } from "@/lib/supabase/server";
import { requireModulePage, PERMISSION } from "@/lib/supabase/require-permission";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ActivityRow = {
  user_id: string;
  display_name: string;
  daily_unique: number | string | null;
  monthly_unique: number | string | null;
  locations_count: number | string | null;
  studios_count: number | string | null;
  last_activity: string | null;
  monthly_actions: Record<string, number | string> | null;
};

function num(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function formatActionBreakdown(actions: Record<string, number | string> | null): string {
  if (!actions) return "";
  return Object.entries(actions)
    .map(([action, count]) => `${action.replace(/_/g, " ")} ${num(count)}`)
    .join(" · ");
}

export default async function AdminActivityPage() {
  await requireModulePage([PERMISSION.ACTIVITY_VIEW]);

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_admin_activity_summary");
  const rows = (data ?? []) as ActivityRow[];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employee Activity</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Today</TableHead>
            <TableHead className="text-right">This month</TableHead>
            <TableHead className="text-right">Locations</TableHead>
            <TableHead className="text-right">Studios</TableHead>
            <TableHead>Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.user_id}>
              <TableCell className="font-medium">{row.display_name}</TableCell>
              <TableCell className="text-right">{num(row.daily_unique)}</TableCell>
              <TableCell className="text-right">
                <div>{num(row.monthly_unique)}</div>
                {formatActionBreakdown(row.monthly_actions) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatActionBreakdown(row.monthly_actions)}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-right">{num(row.locations_count)}</TableCell>
              <TableCell className="text-right">{num(row.studios_count)}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.last_activity
                  ? new Date(row.last_activity).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rows.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No active employees yet.</p>
      )}
    </div>
  );
}

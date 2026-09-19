import Link from "next/link";
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
import { AdminPagination } from "@/components/admin/pagination";
import { InviteEmployeeForm } from "@/components/admin/invite-employee-form";
import { EmployeeRowActions } from "@/components/admin/employee-row-actions";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

type Role = { id: string; name: string; slug: string; description: string | null };
type Permission = { id: string; code: string; description: string | null };

type EmployeeRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role_id: string;
  role_name: string;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  await requireAdminPage();

  const { status: statusParam, page: pageParam, q: qParam } = await searchParams;
  const status: StatusFilter = STATUS_TABS.some((t) => t.value === statusParam)
    ? (statusParam as StatusFilter)
    : "all";
  const q = String(qParam ?? "").trim();
  const p_active = status === "all" ? null : status === "active";

  const supabase = await createClient();

  const [{ data: roles }, { data: permissions }, { data: rolePermissionRows }, { data: countData }] =
    await Promise.all([
      supabase.from("employee_roles").select("id, name, slug, description").order("created_at"),
      supabase.from("employee_permissions").select("id, code, description").order("code"),
      supabase.from("employee_role_permissions").select("role_id, permission_id"),
      supabase.rpc("get_admin_employees_count", { p_active, p_search: q || null }),
    ]);

  const roleList = (roles ?? []) as Role[];
  const permissionList = (permissions ?? []) as Permission[];

  const permissionCodeById = new Map(permissionList.map((p) => [p.id, p.code]));
  const rolePermissions = new Map<string, string[]>();
  for (const row of (rolePermissionRows ?? []) as { role_id: string; permission_id: string }[]) {
    const codes = rolePermissions.get(row.role_id) ?? [];
    codes.push(row.permission_id);
    rolePermissions.set(row.role_id, codes);
  }

  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_employees", {
    p_active,
    p_search: q || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const employees = (data ?? []) as EmployeeRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(page));
    return `/admin/employees?${params.toString()}`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>

      <InviteEmployeeForm roles={roleList} />

      <div className="mb-6 flex gap-1">
        {STATUS_TABS.map((tab) => {
          const params = new URLSearchParams();
          if (tab.value !== "all") params.set("status", tab.value);
          if (q) params.set("q", q);
          return (
            <Link
              key={tab.value}
              href={`/admin/employees${params.toString() ? `?${params.toString()}` : ""}`}
              aria-current={tab.value === status ? "true" : undefined}
              className={
                tab.value === status
                  ? "rounded-full bg-pb-brand px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((row) => {
            const codes = (rolePermissions.get(row.role_id) ?? [])
              .map((id) => permissionCodeById.get(id))
              .filter((code): code is string => Boolean(code));
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.full_name || row.email.split("@")[0]}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.role_name}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {codes.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None</span>
                    ) : (
                      codes.map((code) => (
                        <Badge key={code} variant="secondary">
                          {code}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.is_active ? "default" : "secondary"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <EmployeeRowActions
                    id={row.id}
                    roleId={row.role_id}
                    isActive={row.is_active}
                    roles={roleList.map(({ id, name }) => ({ id, name }))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {employees.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No {status === "all" ? "" : status} employees.
        </p>
      )}

      <AdminPagination
        hrefFor={hrefFor}
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={ADMIN_PAGE_SIZE}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPagination } from "@/components/admin/pagination";
import { ADMIN_PAGE_SIZE, parsePage, rangeFor } from "@/lib/admin/pagination";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  provider: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireAdminPage();

  const { page: pageParam, q: qParam } = await searchParams;
  const q = String(qParam ?? "").trim();

  const supabase = await createClient();
  const { data: countData } = await supabase.rpc("get_admin_users_count", { p_search: q || null });

  const total = Number(countData ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = parsePage(pageParam, totalPages);
  const { from } = rangeFor(currentPage);

  const { data } = await supabase.rpc("get_admin_users", {
    p_search: q || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: from,
  });
  const users = (data ?? []) as UserRow[];

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    return `/admin/users?${params.toString()}`;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Users</h1>

      <form className="mb-6 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name or email" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Sign-in</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Signed up</TableHead>
            <TableHead>Last sign-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">{row.full_name || row.email.split("@")[0]}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </TableCell>
              <TableCell className="capitalize">{row.provider ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={row.email_confirmed_at ? "default" : "secondary"}>
                  {row.email_confirmed_at ? "Verified" : "Unverified"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.created_at)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.last_sign_in_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {users.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No users found.</p>}

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

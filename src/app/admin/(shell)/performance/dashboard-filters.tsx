"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EmployeeOption = { id: string; name: string };

const ALL = "all";

/** Employee + Asia/Kolkata date-range filter bar for the Employee Performance
 * dashboard. Same submit-navigates-with-query-params pattern as
 * AdminListFilters; the server page re-validates every value. */
export function DashboardFilters({
  basePath,
  employees,
  initial,
  defaults,
}: {
  basePath: string;
  employees: EmployeeOption[];
  initial: { employee?: string; from: string; to: string };
  defaults: { from: string; to: string };
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(initial.employee ?? ALL);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  // A bookmarked employee may have been deactivated since; keep their id
  // selectable so the URL state stays visible instead of silently reverting
  // to "All employees".
  const options =
    initial.employee && !employees.some((employee) => employee.id === initial.employee)
      ? [{ id: initial.employee, name: "Inactive employee" }, ...employees]
      : employees;

  const isFiltered = employeeId !== ALL || from !== defaults.from || to !== defaults.to;

  function navigate() {
    const params = new URLSearchParams();
    if (employeeId !== ALL) params.set("employee", employeeId);
    if (from !== defaults.from) params.set("from", from);
    if (to !== defaults.to) params.set("to", to);
    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigate();
      }}
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <div className="flex w-56 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Employee</span>
        <Select
          items={[
            { value: ALL, label: "All employees" },
            ...options.map((employee) => ({ value: employee.id, label: employee.name })),
          ]}
          value={employeeId}
          onValueChange={(value) => setEmployeeId(String(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All employees</SelectItem>
            {options.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-40 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">From (IST)</span>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>

      <div className="flex w-40 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">To (IST)</span>
        <Input
          type="date"
          value={to}
          min={from}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        {isFiltered && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEmployeeId(ALL);
              setFrom(defaults.from);
              setTo(defaults.to);
              router.push(basePath);
            }}
          >
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

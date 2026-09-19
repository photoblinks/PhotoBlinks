"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateEmployeeRole, setEmployeeActive } from "@/app/admin/(shell)/employees/actions";

type RoleOption = { id: string; name: string };

/** Per-row controls for one employee: change role + activate/deactivate.
 * Calls the server actions directly (not via <form action>) so a failure
 * (e.g. the role no longer exists) can be shown inline instead of silently
 * no-opping, mirroring LocationReportModerationActions. */
export function EmployeeRowActions({
  id,
  roleId,
  isActive,
  roles,
}: {
  id: string;
  roleId: string;
  isActive: boolean;
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRoleChange(value: string | null) {
    if (!value) return;
    setPending(true);
    setMessage(null);
    const result = await updateEmployeeRole(id, value);
    setPending(false);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    router.refresh();
  }

  async function handleToggle() {
    setPending(true);
    setMessage(null);
    const result = await setEmployeeActive(id, !isActive);
    setPending(false);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        <Select
          items={roles.map((role) => ({ value: role.id, label: role.name }))}
          value={roleId}
          onValueChange={handleRoleChange}
          disabled={pending}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={handleToggle}
        >
          {isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}

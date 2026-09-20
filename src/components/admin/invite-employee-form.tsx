"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError, FieldRequiredMark } from "@/components/ui/field";
import { inviteEmployee, type EmployeeFormState } from "@/app/admin/(shell)/employees/actions";

type RoleOption = { id: string; name: string };

/** Invite form for creating (or linking) an employee account. The role
 * catalog is read server-side by the employees page and passed in, so no
 * client fetch is needed. Calls the server action directly from the submit
 * handler (not via useActionState) so a successful invite can also clear
 * the controlled fields without resetting state inside an effect. */
export function InviteEmployeeForm({ roles }: { roles: RoleOption[] }) {
  const [state, setState] = useState<EmployeeFormState>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<string | undefined>(undefined);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setState(undefined);
    const result = await inviteEmployee(undefined, formData);
    setIsPending(false);
    setState(result);
    if (result && "success" in result) {
      setEmail("");
      setFullName("");
      setPassword("");
      setRoleId(undefined);
    }
  }

  return (
    <form action={handleSubmit} className="mb-8 rounded-lg border p-4">
      <h2 className="mb-4 text-sm font-semibold">Invite employee</h2>
      <FieldGroup>
        {state && "error" in state && <FieldError>{state.error}</FieldError>}
        {state && "success" in state && (
          <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor="email">
              Email
              <FieldRequiredMark />
            </FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </Field>

          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="full_name">Full name</FieldLabel>
            <Input
              id="full_name"
              name="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Optional — leave blank to email an invite"
              minLength={10}
              maxLength={72}
            />
          </Field>

          <Field className="w-56">
            <FieldLabel htmlFor="role_id">
              Role
              <FieldRequiredMark />
            </FieldLabel>
            <Select
              name="role_id"
              items={roles.map((role) => ({ value: role.id, label: role.name }))}
              value={roleId}
              onValueChange={(value) => setRoleId(value ? String(value) : undefined)}
              required
            >
              <SelectTrigger id="role_id" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : password ? "Create account" : "Invite"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

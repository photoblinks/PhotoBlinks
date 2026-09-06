"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button for the sign-in/sign-up forms that disables itself and
 * shows a pending label while its enclosing `<form action={...}>` server
 * action is in flight — prevents a double-submit while the Supabase Auth
 * round trip is pending. */
export function AuthSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

"use client";

import { Button } from "@/components/ui/button";

/** Submit button for a destructive form action that asks for confirmation
 * first via the browser's native confirm() — the smallest possible
 * "confirmation" for a one-off delete, without introducing a dialog
 * component for it. */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

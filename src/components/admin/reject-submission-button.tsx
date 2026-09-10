"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

/** Reject button that collects an optional rejection reason via window.prompt()
 * before submitting. Consistent with the project's use of window.confirm()
 * in ConfirmSubmitButton — minimal client JS, no dialog component needed. */
export function RejectSubmissionButton({ action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input ref={reasonRef} type="hidden" name="rejection_reason" defaultValue="" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const reason = window.prompt("Rejection reason (optional):");
          if (reason === null) return; // admin cancelled prompt
          if (reasonRef.current) reasonRef.current.value = reason;
          formRef.current?.requestSubmit();
        }}
      >
        Reject
      </Button>
    </form>
  );
}

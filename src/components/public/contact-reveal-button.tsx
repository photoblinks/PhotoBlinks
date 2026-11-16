"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/public/whatsapp-icon";
import {
  revealPhotographerContact,
  type ContactChannel,
  type ContactTarget,
} from "@/app/(public)/photographers/contact-actions";

const ERROR_MESSAGES = {
  rate_limited: "Too many requests. Please try again later.",
  not_found: "Contact details are unavailable right now.",
} as const;

/** Call / WhatsApp trigger for a photographer. The number is not in the page:
 * clicking opens a safety notice, and only confirming it fetches the number
 * (rate-limited, server-side) and opens the dialer / WhatsApp. */
export function ContactRevealButton({
  target,
  channel,
  label,
  variant,
  size,
  className,
  onConfirm,
}: {
  target: ContactTarget;
  channel: ContactChannel;
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** Fired once the visitor accepts the notice (e.g. analytics). */
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icon = channel === "call" ? Phone : WhatsAppIcon;

  async function handleConfirm() {
    setPending(true);
    setError(null);
    onConfirm?.();
    const result = await revealPhotographerContact(target, channel);
    if ("error" in result) {
      setPending(false);
      setError(ERROR_MESSAGES[result.error]);
      return;
    }
    // Same-tab navigation (not window.open) so mobile popup blockers can't
    // swallow it after the async call.
    window.location.href = result.url;
    setPending(false);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Before you contact this photographer</DialogTitle>
          <DialogDescription>
            From here on, your conversation, booking and payments are strictly between you and the
            photographer. PhotoBlinks is not a party to it and takes no responsibility for it.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Please don&apos;t pay the full amount in advance. Pay only a small token advance and settle
          the rest after the service is delivered.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={pending}>
            <Icon className="size-4" aria-hidden="true" />
            {pending ? "Please wait…" : channel === "call" ? "Call now" : "Open WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

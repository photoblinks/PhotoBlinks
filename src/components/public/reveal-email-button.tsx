"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Keeps the address out of the initial server-rendered HTML (where email
 * scrapers look) — it only reaches the page after a real click. */
export function RevealEmailButton({ email }: { email: string }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <a href={`mailto:${email}`} className="font-medium text-pb-brand hover:underline">
        {email}
      </a>
    );
  }

  return (
    <Button type="button" variant="outline" onClick={() => setRevealed(true)}>
      <Mail className="size-4" />
      View Contact Email
    </Button>
  );
}

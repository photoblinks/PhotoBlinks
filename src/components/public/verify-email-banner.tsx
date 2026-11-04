"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { hasAuthCookie, loadSupabaseClient } from "@/lib/supabase/auth-cookie";
import { resendVerificationEmail } from "@/lib/auth-actions";

/** "Verify your email" strip for signed-in users whose address is not yet
 * verified (see 20261106000000_email_verification.sql). Client-only for the
 * same reason as AccountMenu: public pages are statically rendered, so the
 * viewer's state can't be read on the server. Renders nothing for anonymous
 * visitors, verified users and Google accounts. */
export function VerifyEmailBanner({ photographer }: { photographer?: boolean }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!hasAuthCookie()) return;
    let cancelled = false;
    loadSupabaseClient().then(async (supabase) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user?.email || (user.app_metadata?.provider ?? "email") !== "email") return;
      const { data: verified } = await supabase
        .from("email_verifications")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && !verified) setEmail(user.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!email) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      <span>
        Verify your email — we sent a link to <strong>{email}</strong>.
        {photographer && " Your profile becomes visible on the website once your email is verified and approved."}
      </span>{" "}
      <button
        type="button"
        disabled={pending}
        className="font-medium underline underline-offset-2 disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            const { ok } = await resendVerificationEmail(pathname);
            setMessage(ok ? "Verification email sent." : "Couldn't send. Try again in a minute.");
          })
        }
      >
        {pending ? "Sending…" : "Resend email"}
      </button>
      {message && <span className="ml-2">{message}</span>}
    </div>
  );
}

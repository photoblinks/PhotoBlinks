"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { GoogleSignInButton } from "@/components/public/google-sign-in-button";
import { AuthDivider } from "@/components/public/auth-divider";

type Mode = "sign-in" | "sign-up";

/** Sign in / sign up without ever leaving the current page — used wherever
 * a guest action (favouriting, commenting) needs an account first. Unlike
 * the full /sign-in and /sign-up pages, email/password here goes straight
 * through the browser Supabase client (not a server action + redirect), so
 * a successful sign-in updates FavouritesProvider's reactive auth state in
 * place and the caller can immediately retry whatever the visitor was
 * doing. Google still redirects to Google and back through /auth/callback
 * (real OAuth, can't be done in-place) — it lands back on this same page,
 * but as a fresh page load, not a resumed in-memory action. */
export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  function resetForm() {
    setEmail("");
    setPassword("");
    setError(null);
    setPending(false);
    setAwaitingConfirmation(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setAwaitingConfirmation(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const supabase = createClient();

    if (mode === "sign-up") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // `/auth/confirm` itself is built by Supabase's email template from
        // this value (see supabase/templates/confirmation.html) — this must
        // be the actual destination, not the confirm route itself. Uses
        // window.location.origin (not jsonld.ts's absoluteUrl, which
        // hardcodes the production domain) so this also works in local dev,
        // same reasoning as GoogleSignInButton's redirectTo.
        options: { emailRedirectTo: `${window.location.origin}${pathname}` },
      });

      if (signUpError) {
        setPending(false);
        setError(
          signUpError.code === "user_already_exists"
            ? "An account with this email already exists. Try signing in instead."
            : signUpError.message,
        );
        return;
      }

      if (!data.session) {
        // Email confirmations are required — no session yet, so there's
        // nothing to resume here. The visitor confirms via email, then
        // signs in normally (the dialog stays open with this notice
        // instead of silently closing on an account that can't do
        // anything yet).
        setPending(false);
        setAwaitingConfirmation(true);
        return;
      }

      // Session issued immediately (email confirmations off) — the auth
      // state listener in FavouritesProvider picks this up and closes the
      // dialog / resolves the pending action itself.
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (signInError) {
      setError(
        signInError.code === "email_not_confirmed"
          ? "Please confirm your email before signing in — check your inbox for the confirmation link."
          : "Invalid email or password.",
      );
    }
    // On success, FavouritesProvider's auth state listener closes the
    // dialog and resolves the caller's pending action.
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "sign-in" ? "Sign In" : "Sign Up"}</DialogTitle>
          <DialogDescription>
            {mode === "sign-in"
              ? "Sign in to continue — you'll stay right here."
              : "Create an account to continue — you'll stay right here."}
          </DialogDescription>
        </DialogHeader>

        {awaitingConfirmation ? (
          <p className="text-sm text-pb-brand">
            Check your email to confirm your account, then sign in below.
          </p>
        ) : (
          <>
            <GoogleSignInButton next={pathname} />
            <AuthDivider />

            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="auth-dialog-email">Email</FieldLabel>
                  <Input
                    id="auth-dialog-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="auth-dialog-password">Password</FieldLabel>
                  <Input
                    id="auth-dialog-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === "sign-up" ? 6 : undefined}
                    required
                  />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending
                    ? mode === "sign-in"
                      ? "Signing in…"
                      : "Creating account…"
                    : mode === "sign-in"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </FieldGroup>
            </form>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("sign-up")}
                className="font-medium text-pb-brand hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("sign-in")}
                className="font-medium text-pb-brand hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}

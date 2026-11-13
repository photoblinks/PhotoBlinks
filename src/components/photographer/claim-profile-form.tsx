"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  requestClaimCode,
  searchClaimableProfiles,
  submitClaim,
  type ClaimableProfile,
} from "@/app/(public)/claim-profile/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/public/turnstile-widget";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";

const FIELDS = ["profile_id", "full_name", "studio_name", "email", "phone_number", "proof_url", "message"] as const;

export function ClaimProfileForm() {
  const [codeStep, requestCode] = useActionState(requestClaimCode, null);
  const [submitted, submit] = useActionState(submitClaim, null);

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; list: ClaimableProfile[] }>({ query: "", list: [] });
  const [selected, setSelected] = useState<ClaimableProfile | null>(null);
  const [, startSearch] = useTransition();
  // True after the claimant goes back from the code step to edit their details.
  const [editing, setEditing] = useState(false);
  // Held in the browser only (never returned by the server) and re-sent with the code.
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (selected || query.trim().length < 3) return;
    const timer = setTimeout(() => {
      startSearch(async () => setFound({ query, list: await searchClaimableProfiles(query) }));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const searched = !selected && found.query === query && query.trim().length >= 3;
  const results = searched ? found.list : [];

  const v = codeStep?.values ?? {};
  const value = (key: (typeof FIELDS)[number]) => v[key] ?? "";

  if (codeStep?.step === "code" && !editing) {
    return (
      <form action={submit} className="mt-8">
        {FIELDS.map((key) => (
          <input key={key} type="hidden" name={key} value={value(key)} />
        ))}
        <input type="hidden" name="password" value={password} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="code">Verification code</FieldLabel>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
            />
            <FieldDescription>We emailed a 6-digit code to {v.email}.</FieldDescription>
          </Field>
          {submitted?.error && <FieldError>{submitted.error}</FieldError>}
          <AuthSubmitButton label="Verify & send claim" pendingLabel="Verifying…" />
          <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
            Back — edit details / resend code
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form
      action={(formData) => {
        setEditing(false);
        requestCode(formData);
      }}
      className="mt-8"
    >
      <input type="hidden" name="profile_id" value={selected?.id ?? value("profile_id")} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="claim_search">Find your profile *</FieldLabel>
          {selected ? (
            <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{selected.studio_name}</span>{" "}
                <span className="text-muted-foreground">
                  · {selected.city}, {selected.state_name}
                </span>
              </span>
              <button
                type="button"
                className="text-pb-brand hover:underline"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Input
                id="claim_search"
                placeholder="Type your photography name (3+ letters)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
              />
              {results.length > 0 && (
                <ul className="mt-1 divide-y rounded-md border bg-card text-sm">
                  {results.map((profile) => (
                    <li key={profile.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                          setSelected(profile);
                        }}
                      >
                        <span className="font-medium">{profile.studio_name}</span>{" "}
                        <span className="text-muted-foreground">
                          · {profile.city}, {profile.state_name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searched && results.length === 0 && (
                <FieldDescription>
                  No unclaimed profile found. It may already be claimed, or not listed yet.
                </FieldDescription>
              )}
            </>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="full_name">Your full name *</FieldLabel>
          <Input id="full_name" name="full_name" defaultValue={value("full_name")} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="studio_name">Photography name (as you know it) *</FieldLabel>
          <Input id="studio_name" name="studio_name" defaultValue={value("studio_name")} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone_number">Phone number *</FieldLabel>
          <Input id="phone_number" name="phone_number" type="tel" defaultValue={value("phone_number")} required />
          <FieldDescription>The number your photography business uses — we compare it with our records.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email *</FieldLabel>
          <Input id="email" name="email" type="email" defaultValue={value("email")} required />
          <FieldDescription>
            We&apos;ll send a verification code here. This becomes your login email.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password *</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <FieldDescription>At least 6 characters. You&apos;ll log in with your email and this password.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="proof_url">Instagram or portfolio link *</FieldLabel>
          <Input
            id="proof_url"
            name="proof_url"
            type="url"
            placeholder="https://instagram.com/yourstudio"
            defaultValue={value("proof_url")}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="message">How can we verify you own this photography profile? *</FieldLabel>
          <Textarea id="message" name="message" rows={4} maxLength={1000} defaultValue={value("message")} required />
        </Field>
        {codeStep?.error && <FieldError>{codeStep.error}</FieldError>}
        <TurnstileWidget />
        <AuthSubmitButton label="Send verification code" pendingLabel="Sending code…" />
      </FieldGroup>
    </form>
  );
}

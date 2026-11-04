"use client";

import { useActionState } from "react";
import { signUpPhotographer } from "@/app/(public)/sign-in/photographer/actions";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/public/turnstile-widget";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { CountryStateFields } from "@/components/photographer/country-state-fields";

type Option = { id: string; name: string };
type State = Option & { country_id: string };

/** Combined account + photographer-profile signup form. On a server-side
 * validation error the action returns the error plus the submitted values
 * (never the password) so everything stays filled in. React resets
 * uncontrolled inputs after an action, hence defaultValue from the returned
 * values rather than relying on the DOM keeping them. */
export function PhotographerSignupForm({
  countries,
  states,
}: {
  countries: Option[];
  states: State[];
}) {
  const [result, formAction] = useActionState(signUpPhotographer, null);
  const v = result?.values ?? {};

  return (
    <form action={formAction} className="mt-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="full_name">Full Name *</FieldLabel>
          <Input id="full_name" name="full_name" defaultValue={v.full_name} required autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="studio_name">Photography Studio Name *</FieldLabel>
          <Input id="studio_name" name="studio_name" defaultValue={v.studio_name} required />
        </Field>
        <CountryStateFields
          countries={countries}
          states={states}
          defaultCountryId={v.country_id}
          defaultStateId={v.state_id}
        />
        <Field>
          <FieldLabel htmlFor="city">City *</FieldLabel>
          <Input id="city" name="city" placeholder="Bengaluru" defaultValue={v.city} required />
        </Field>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="phone_number">Phone Number *</FieldLabel>
            <Input id="phone_number" name="phone_number" type="tel" defaultValue={v.phone_number} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="whatsapp_number">WhatsApp Number *</FieldLabel>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              defaultValue={v.whatsapp_number}
              required
            />
          </Field>
        </Field>
        <Field>
          <FieldLabel htmlFor="signup_email">Email Id *</FieldLabel>
          <Input id="signup_email" name="email" type="email" defaultValue={v.email} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="signup_password">Password *</FieldLabel>
          <Input id="signup_password" name="password" type="password" minLength={6} required />
        </Field>
        {result?.error && <FieldError>{result.error}</FieldError>}
        <TurnstileWidget />
        <AuthSubmitButton label="Create Account" pendingLabel="Creating account…" />
      </FieldGroup>
    </form>
  );
}

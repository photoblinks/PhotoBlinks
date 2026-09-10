"use client";

import { createPhotographerProfile } from "@/app/photographer/signup/actions";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthSubmitButton } from "@/components/public/auth-submit-button";
import { CountryStateFields } from "@/components/photographer/country-state-fields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Option = { id: string; name: string };
type State = Option & { country_id: string };

/** Mandatory, non-dismissible profile-completion popup shown on the
 * dashboard for a photographer with no photographer_profiles row yet and
 * no signup-form metadata to auto-create one from — i.e. a Google sign-in,
 * which never collects these fields during OAuth. Reuses the exact same
 * server action, validation, and RLS-protected insert as the standalone
 * /photographer/signup form — this is a different presentation of the
 * same profile-creation path, not a second one.
 *
 * Controlled `open` with a no-op onOpenChange, and the built-in close
 * button hidden, so it can't be dismissed via Escape, outside click, or a
 * close icon — these details are required before the dashboard is usable. */
export function CompleteProfileModal({
  countries,
  states,
  error,
}: {
  countries: Option[];
  states: State[];
  error?: string;
}) {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete your photographer profile</DialogTitle>
          <DialogDescription>
            A few required details before you can use your dashboard and submit photos.
          </DialogDescription>
        </DialogHeader>

        <form action={createPhotographerProfile} className="max-h-[70vh] overflow-y-auto pr-1">
          <input type="hidden" name="return_to" value="/photographer" />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="modal_display_name">Full Name *</FieldLabel>
              <Input id="modal_display_name" name="display_name" required autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="modal_studio_name">Photography Studio Name *</FieldLabel>
              <Input id="modal_studio_name" name="studio_name" required />
            </Field>
            <CountryStateFields countries={countries} states={states} />
            <Field>
              <FieldLabel htmlFor="modal_city">City *</FieldLabel>
              <Input id="modal_city" name="city" placeholder="Bengaluru" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="modal_phone_number">Phone Number *</FieldLabel>
              <Input id="modal_phone_number" name="phone_number" type="tel" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="modal_whatsapp_number">WhatsApp Number *</FieldLabel>
              <Input id="modal_whatsapp_number" name="whatsapp_number" type="tel" required />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <AuthSubmitButton label="Save & Continue" pendingLabel="Saving…" />
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

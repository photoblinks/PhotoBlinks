"use client";

import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };
type State = Option & { country_id: string };

/** Country → dependent State dropdown for the photographer signup/edit
 * forms, backed by the same canonical countries/states tables Locations
 * and Studios use (src/components/admin/geo-selector.tsx is the admin
 * equivalent — not reused directly here since it also bundles an
 * unrelated free-text City field with a different prop shape). Selecting
 * a country always resets the chosen state, since a state from the
 * previous country is never valid under the new one. */
export function CountryStateFields({
  countries,
  states,
  defaultCountryId,
  defaultStateId,
}: {
  countries: Option[];
  states: State[];
  defaultCountryId?: string;
  defaultStateId?: string;
}) {
  const [countryId, setCountryId] = useState(defaultCountryId ?? "");
  const [stateId, setStateId] = useState(defaultStateId ?? "");

  const statesForCountry = states.filter((s) => s.country_id === countryId);

  function handleCountryChange(value: string) {
    setCountryId(value);
    setStateId("");
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="country_id">Country *</FieldLabel>
        <Select
          name="country_id"
          items={countries.map((country) => ({ value: country.id, label: country.name }))}
          value={countryId}
          onValueChange={(value) => handleCountryChange(String(value))}
          required
        >
          <SelectTrigger id="country_id" className="w-full">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.id} value={country.id}>
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="state_id">State *</FieldLabel>
        <Select
          name="state_id"
          items={statesForCountry.map((state) => ({ value: state.id, label: state.name }))}
          value={stateId}
          onValueChange={(value) => setStateId(String(value))}
          disabled={!countryId}
          required
        >
          <SelectTrigger id="state_id" className="w-full">
            <SelectValue placeholder={countryId ? "Select a state" : "Select a country first"} />
          </SelectTrigger>
          <SelectContent>
            {statesForCountry.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

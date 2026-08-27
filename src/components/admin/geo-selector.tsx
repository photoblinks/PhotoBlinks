"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
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

/** Country → dependent State dropdown, plus a plain City text field.
 * Changing country clears the selected state; changing state clears the
 * typed city, since it may not belong to the new state. The city itself
 * isn't a dropdown of existing cities — the server finds-or-creates the
 * matching city row by normalized name within the selected state (see
 * find_or_create_city), so admins never have to worry about exact
 * capitalization/whitespace creating a duplicate. */
export function GeoSelector({
  countries,
  states,
  defaultCountryId,
  defaultStateId,
  defaultCityName,
}: {
  countries: Option[];
  states: State[];
  defaultCountryId?: string;
  defaultStateId?: string;
  defaultCityName?: string;
}) {
  const [countryId, setCountryId] = useState(defaultCountryId ?? "");
  const [stateId, setStateId] = useState(defaultStateId ?? "");
  const [cityName, setCityName] = useState(defaultCityName ?? "");

  const statesForCountry = states.filter((s) => s.country_id === countryId);

  function handleCountryChange(value: string) {
    setCountryId(value);
    setStateId("");
    setCityName("");
  }

  function handleStateChange(value: string) {
    setStateId(value);
    setCityName("");
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="country_id">Country</FieldLabel>
        <Select
          name="country_id"
          items={countries.map((country) => ({ value: country.id, label: country.name }))}
          value={countryId || undefined}
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
        <FieldLabel htmlFor="state_id">State</FieldLabel>
        <Select
          name="state_id"
          items={statesForCountry.map((state) => ({ value: state.id, label: state.name }))}
          value={stateId || undefined}
          onValueChange={(value) => handleStateChange(String(value))}
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

      <Field>
        <FieldLabel htmlFor="city_name">City</FieldLabel>
        <Input
          id="city_name"
          name="city_name"
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          placeholder={stateId ? "e.g. Madikeri" : "Select a state first"}
          disabled={!stateId}
          required
        />
      </Field>
    </>
  );
}

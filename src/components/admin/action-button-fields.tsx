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
import type { ActionType } from "@/lib/public-data";

export type ActionButtonValue = {
  action_type?: ActionType | null;
  action_value?: string | null;
};

const VALUE_FIELD: Record<ActionType, { label: string; placeholder: string; type: string }> = {
  book_now: { label: "Booking URL", placeholder: "https://...", type: "url" },
  website: { label: "Website URL", placeholder: "https://...", type: "url" },
  call_now: { label: "Phone Number", placeholder: "+91 98765 43210", type: "tel" },
};

// Matches the sentinel expected by parseLocationForm/parseStudioForm's
// optionalField() — picking it clears the field back to unset.
const UNSET = "unspecified";

const ACTION_TYPE_ITEMS = [
  { value: UNSET, label: "None" },
  { value: "book_now", label: "Book Now" },
  { value: "website", label: "Website" },
  { value: "call_now", label: "Call Now" },
];

/** Optional call-to-action button shown below "Go to Location" on the
 * public detail page. Shared by locations and studios. */
export function ActionButtonFields({ defaultValue }: { defaultValue?: ActionButtonValue }) {
  const [actionType, setActionType] = useState<ActionType | "">(defaultValue?.action_type ?? "");
  const valueField = actionType ? VALUE_FIELD[actionType] : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="action_type">Action Button</FieldLabel>
        <Select
          name="action_type"
          items={ACTION_TYPE_ITEMS}
          value={actionType || UNSET}
          onValueChange={(value) => setActionType(value === UNSET ? "" : (value as ActionType))}
        >
          <SelectTrigger id="action_type" className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET} className="text-muted-foreground">
              None
            </SelectItem>
            <SelectItem value="book_now">Book Now</SelectItem>
            <SelectItem value="website">Website</SelectItem>
            <SelectItem value="call_now">Call Now</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {valueField && (
        <Field>
          <FieldLabel htmlFor="action_value">{valueField.label}</FieldLabel>
          <Input
            key={actionType}
            id="action_value"
            name="action_value"
            type={valueField.type}
            defaultValue={defaultValue?.action_value ?? ""}
            placeholder={valueField.placeholder}
            required
          />
        </Field>
      )}
    </>
  );
}

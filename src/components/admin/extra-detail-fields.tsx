import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ExtraDetailsValue = {
  drone_status?: "allowed" | "restricted" | "conditional" | null;
  entry_fee?: string | null;
  best_season?: string | null;
  best_time?: string | null;
  crowd?: string | null;
  access?: string | null;
  privacy?: string | null;
};

/** Shared optional detail fields for both locations and studios. All
 * optional — only shown on the public detail page when set. */
export function ExtraDetailFields({ defaultValue }: { defaultValue?: ExtraDetailsValue }) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="drone_status">Drone Status</FieldLabel>
        <Select name="drone_status" defaultValue={defaultValue?.drone_status ?? undefined}>
          <SelectTrigger id="drone_status" className="w-full">
            <SelectValue placeholder="Not specified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="allowed">Allowed</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="conditional">Conditional</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="entry_fee">Entry Fee</FieldLabel>
        <Input id="entry_fee" name="entry_fee" defaultValue={defaultValue?.entry_fee ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="best_season">Best Season</FieldLabel>
        <Input id="best_season" name="best_season" defaultValue={defaultValue?.best_season ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="best_time">Best Time</FieldLabel>
        <Input id="best_time" name="best_time" defaultValue={defaultValue?.best_time ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="crowd">Crowd</FieldLabel>
        <Input id="crowd" name="crowd" defaultValue={defaultValue?.crowd ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="access">Access</FieldLabel>
        <Input id="access" name="access" defaultValue={defaultValue?.access ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="privacy">Privacy</FieldLabel>
        <Input id="privacy" name="privacy" defaultValue={defaultValue?.privacy ?? ""} />
      </Field>
    </>
  );
}

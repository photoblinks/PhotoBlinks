import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldSeparator } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AvailabilityStatus } from "@/lib/public-data";

// Sentinel item value that lets an admin explicitly clear a dropdown back
// to "not specified" — a plain Select can't be deselected once a real item
// has been picked, so this is a real, selectable item rather than an empty
// value. The server strips it back to `undefined` (see actions.ts).
export const UNSET = "unspecified";

const AVAILABILITY_ITEMS = [
  { value: UNSET, label: "Not specified" },
  { value: "available", label: "Available" },
  { value: "not_available", label: "Not Available" },
];

const DRONE_STATUS_ITEMS = [
  { value: UNSET, label: "Not specified" },
  { value: "allowed", label: "Allowed" },
  { value: "allowed_with_permission", label: "Allowed with Permission" },
  { value: "restricted", label: "Restricted" },
  { value: "prohibited", label: "Prohibited" },
];

export type ExtraDetailsValue = {
  // Shoot Details
  pre_wedding_shoot?: string | null;
  prior_booking?: string | null;
  camera_charges?: string | null;
  drone_status?: "allowed" | "allowed_with_permission" | "restricted" | "prohibited" | null;
  // Pricing & Timing
  entry_fee?: string | null;
  best_season?: string | null;
  best_time?: string | null;
  // Amenities
  changing_rooms?: AvailabilityStatus | null;
  parking_facility?: AvailabilityStatus | null;
  facilities?: string | null;
  // Environment
  access?: string | null;
  crowd?: string | null;
  privacy?: string | null;
};

function AvailabilityField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: AvailabilityStatus | null;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Select name={name} items={AVAILABILITY_ITEMS} defaultValue={defaultValue ?? undefined}>
        <SelectTrigger id={name} className="w-full">
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET} className="text-muted-foreground">
            Not specified
          </SelectItem>
          <SelectItem value="available">Available</SelectItem>
          <SelectItem value="not_available">Not Available</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Shared optional detail fields for both locations and studios, grouped
 * into Shoot Details, Pricing & Timing, Amenities, and Environment — all
 * optional, only shown on the public detail page when set.
 *
 * `priceNote` is location-only (studios don't have a Pricing box with this
 * caption) — pass it to render the field right after Entry Fee; omit it
 * (as StudioForm does) to leave it out entirely. */
export function ExtraDetailFields({
  defaultValue,
  priceNote,
}: {
  defaultValue?: ExtraDetailsValue;
  priceNote?: { defaultValue?: string | null };
}) {
  return (
    <>
      <FieldSeparator>Shoot Details</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="pre_wedding_shoot">Pre-Wedding Shoot</FieldLabel>
        <Input
          id="pre_wedding_shoot"
          name="pre_wedding_shoot"
          defaultValue={defaultValue?.pre_wedding_shoot ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="prior_booking">Prior Booking</FieldLabel>
        <Input
          id="prior_booking"
          name="prior_booking"
          defaultValue={defaultValue?.prior_booking ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="camera_charges">Camera Charges</FieldLabel>
        <Input
          id="camera_charges"
          name="camera_charges"
          defaultValue={defaultValue?.camera_charges ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="drone_status">Drone Status</FieldLabel>
        <Select
          name="drone_status"
          items={DRONE_STATUS_ITEMS}
          defaultValue={defaultValue?.drone_status ?? undefined}
        >
          <SelectTrigger id="drone_status" className="w-full">
            <SelectValue placeholder="Not specified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET} className="text-muted-foreground">
              Not specified
            </SelectItem>
            <SelectItem value="allowed">Allowed</SelectItem>
            <SelectItem value="allowed_with_permission">Allowed with Permission</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="prohibited">Prohibited</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <FieldSeparator>Pricing & Timing</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="entry_fee">Entry Fee</FieldLabel>
        <Input id="entry_fee" name="entry_fee" defaultValue={defaultValue?.entry_fee ?? ""} />
      </Field>

      {priceNote && (
        <Field>
          <FieldLabel htmlFor="price_note">Price Caption</FieldLabel>
          <Input
            id="price_note"
            name="price_note"
            defaultValue={priceNote.defaultValue ?? ""}
            placeholder="e.g. Photoshoot Price"
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="best_season">Best Season</FieldLabel>
        <Input id="best_season" name="best_season" defaultValue={defaultValue?.best_season ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="best_time">Best Time</FieldLabel>
        <Input id="best_time" name="best_time" defaultValue={defaultValue?.best_time ?? ""} />
      </Field>

      <FieldSeparator>Amenities</FieldSeparator>

      <AvailabilityField
        name="changing_rooms"
        label="Changing Rooms"
        defaultValue={defaultValue?.changing_rooms}
      />

      <AvailabilityField
        name="parking_facility"
        label="Parking Facility"
        defaultValue={defaultValue?.parking_facility}
      />

      <Field>
        <FieldLabel htmlFor="facilities">Facilities</FieldLabel>
        <Input id="facilities" name="facilities" defaultValue={defaultValue?.facilities ?? ""} />
      </Field>

      <FieldSeparator>Environment</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="access">Access</FieldLabel>
        <Input id="access" name="access" defaultValue={defaultValue?.access ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="crowd">Crowd</FieldLabel>
        <Input id="crowd" name="crowd" defaultValue={defaultValue?.crowd ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="privacy">Privacy</FieldLabel>
        <Input id="privacy" name="privacy" defaultValue={defaultValue?.privacy ?? ""} />
      </Field>
    </>
  );
}

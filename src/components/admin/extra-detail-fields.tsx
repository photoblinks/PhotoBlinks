"use client";

import { useState } from "react";
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

const PRE_WEDDING_SHOOT_ITEMS = [
  { value: UNSET, label: "Not specified" },
  { value: "allowed", label: "✅ Allowed" },
  { value: "conditional", label: "⚠️ Conditional" },
  { value: "prohibited", label: "❌ Prohibited" },
];

export type ExtraDetailsValue = {
  // Shoot Details
  pre_wedding_shoot?: "allowed" | "conditional" | "prohibited" | null;
  pre_wedding_shoot_condition?: string | null;
  prior_booking?: string | null;
  drone_status?: "allowed" | "allowed_with_permission" | "restricted" | "prohibited" | null;
  drone_permission?: string | null;
  recommended_outfits?: string | null;
  // Pricing & Timing
  entry_fee?: string | null;
  shoot_permit_fee?: string | null;
  vehicle_parking_fee?: string | null;
  best_season?: string | null;
  best_time?: string | null;
  // Amenities
  road_accessibility?: string | null;
  parking_facility?: AvailabilityStatus | null;
  boating_available?: string | null;
  changing_rooms?: AvailabilityStatus | null;
  restrooms?: string | null;
  facilities?: string | null;
  // Environment
  access?: string | null;
  crowd?: string | null;
  privacy?: string | null;
  weather_lighting?: string | null;
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
  const [preWeddingShoot, setPreWeddingShoot] = useState(defaultValue?.pre_wedding_shoot ?? undefined);
  const showPreWeddingShootCondition = preWeddingShoot === "conditional";

  const [droneStatus, setDroneStatus] = useState(defaultValue?.drone_status ?? undefined);
  const showDronePermission = droneStatus === "allowed_with_permission" || droneStatus === "restricted";

  return (
    <>
      <FieldSeparator>Shoot Details</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="pre_wedding_shoot">Pre-Wedding Shoot</FieldLabel>
        <Select
          name="pre_wedding_shoot"
          items={PRE_WEDDING_SHOOT_ITEMS}
          value={preWeddingShoot ?? UNSET}
          onValueChange={(value) =>
            setPreWeddingShoot(value === UNSET ? undefined : (value as typeof preWeddingShoot))
          }
        >
          <SelectTrigger id="pre_wedding_shoot" className="w-full">
            <SelectValue placeholder="Not specified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET} className="text-muted-foreground">
              Not specified
            </SelectItem>
            <SelectItem value="allowed">✅ Allowed</SelectItem>
            <SelectItem value="conditional">⚠️ Conditional</SelectItem>
            <SelectItem value="prohibited">❌ Prohibited</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {showPreWeddingShootCondition && (
        <Field>
          <FieldLabel htmlFor="pre_wedding_shoot_condition">Pre-Wedding Shoot Condition</FieldLabel>
          <Input
            id="pre_wedding_shoot_condition"
            name="pre_wedding_shoot_condition"
            defaultValue={defaultValue?.pre_wedding_shoot_condition ?? ""}
            placeholder="What is the condition?"
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="prior_booking">Prior Booking</FieldLabel>
        <Input
          id="prior_booking"
          name="prior_booking"
          defaultValue={defaultValue?.prior_booking ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="drone_status">Drone Status</FieldLabel>
        <Select
          name="drone_status"
          items={DRONE_STATUS_ITEMS}
          value={droneStatus ?? UNSET}
          onValueChange={(value) =>
            setDroneStatus(value === UNSET ? undefined : (value as typeof droneStatus))
          }
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

      {showDronePermission && (
        <Field>
          <FieldLabel htmlFor="drone_permission">Drone Permission</FieldLabel>
          <Input
            id="drone_permission"
            name="drone_permission"
            defaultValue={defaultValue?.drone_permission ?? ""}
            placeholder="Where should permission be taken from?"
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="recommended_outfits">Recommended Outfits</FieldLabel>
        <Input
          id="recommended_outfits"
          name="recommended_outfits"
          defaultValue={defaultValue?.recommended_outfits ?? ""}
        />
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
        <FieldLabel htmlFor="shoot_permit_fee">Shoot/Permit Info</FieldLabel>
        <Input
          id="shoot_permit_fee"
          name="shoot_permit_fee"
          defaultValue={defaultValue?.shoot_permit_fee ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="vehicle_parking_fee">Vehicle Parking</FieldLabel>
        <Input
          id="vehicle_parking_fee"
          name="vehicle_parking_fee"
          defaultValue={defaultValue?.vehicle_parking_fee ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="best_season">Best Season</FieldLabel>
        <Input id="best_season" name="best_season" defaultValue={defaultValue?.best_season ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="best_time">Best Time of Day</FieldLabel>
        <Input id="best_time" name="best_time" defaultValue={defaultValue?.best_time ?? ""} />
      </Field>

      <FieldSeparator>Amenities</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="road_accessibility">Road Accessibility</FieldLabel>
        <Input
          id="road_accessibility"
          name="road_accessibility"
          defaultValue={defaultValue?.road_accessibility ?? ""}
        />
      </Field>

      <AvailabilityField
        name="parking_facility"
        label="Vehicle Parking Availability"
        defaultValue={defaultValue?.parking_facility}
      />

      <Field>
        <FieldLabel htmlFor="boating_available">Boating Available for Shoot</FieldLabel>
        <Input
          id="boating_available"
          name="boating_available"
          defaultValue={defaultValue?.boating_available ?? ""}
        />
      </Field>

      <AvailabilityField
        name="changing_rooms"
        label="Changing Facilities"
        defaultValue={defaultValue?.changing_rooms}
      />

      <Field>
        <FieldLabel htmlFor="restrooms">Restrooms</FieldLabel>
        <Input id="restrooms" name="restrooms" defaultValue={defaultValue?.restrooms ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="facilities">Facilities</FieldLabel>
        <Input id="facilities" name="facilities" defaultValue={defaultValue?.facilities ?? ""} />
      </Field>

      <FieldSeparator>Environment</FieldSeparator>

      <Field>
        <FieldLabel htmlFor="access">Access Level</FieldLabel>
        <Input id="access" name="access" defaultValue={defaultValue?.access ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="crowd">Crowd Level</FieldLabel>
        <Input id="crowd" name="crowd" defaultValue={defaultValue?.crowd ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="privacy">Privacy Score</FieldLabel>
        <Input id="privacy" name="privacy" defaultValue={defaultValue?.privacy ?? ""} />
      </Field>

      <Field>
        <FieldLabel htmlFor="weather_lighting">Weather & Lighting Considerations</FieldLabel>
        <Input
          id="weather_lighting"
          name="weather_lighting"
          defaultValue={defaultValue?.weather_lighting ?? ""}
        />
      </Field>
    </>
  );
}

import Link from "next/link";
import {
  getEnabledLocationInfoFields,
  getLocationInfoFieldLabel,
  formatLocationInfoValue,
  type LocationInfoTableConfig,
} from "@/lib/location-info-fields";
import type { PublicLocationInfoEntry } from "@/lib/public-data";

/**
 * Renders the editorial "location information table": one field/value table
 * per referenced canonical location, showing only the configured, approved
 * location fields. Fields with no value for a given location are skipped,
 * and a location with no present fields renders nothing (no empty table).
 * Location facts are never duplicated into editorial JSON — this component
 * receives only the fields resolved by getPublicLocationInfoByIds.
 */
export function LocationInfoTable({
  title,
  locations,
  config,
}: {
  title?: string;
  locations: PublicLocationInfoEntry[];
  config: LocationInfoTableConfig;
}) {
  const fields = getEnabledLocationInfoFields(config);
  if (fields.length === 0 || locations.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white p-4 sm:p-5">
      {title && <h3 className="font-heading mb-4 text-lg font-semibold">{title}</h3>}
      <div className="flex flex-col gap-6">
        {locations.map((location) => {
          const rows = fields
            .map((field) => ({ field, value: location.details[field.code] }))
            .filter((row) => row.value != null && String(row.value).trim() !== "");

          if (rows.length === 0) return null;

          return (
            <div key={location.id}>
              <Link
                href={`/location/${location.slug}`}
                className="mb-2 inline-block font-medium text-pb-brand hover:underline"
              >
                {location.name}
              </Link>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {rows.map(({ field, value }) => (
                    <tr key={field.code} className="border-t border-border">
                      <td className="w-48 py-2 pr-4 align-top text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <field.icon className="size-4 shrink-0 text-muted-foreground" />
                          {getLocationInfoFieldLabel(field, config)}
                        </span>
                      </td>
                      <td className="py-2 font-medium">{formatLocationInfoValue(field.code, value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

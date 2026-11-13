/**
 * Bulk photographer profile import. Reuses the shared workbook parser
 * (parseBulkImportSheet), limits and result types from the locations import;
 * only the columns, validation rules and insert mapping differ. Rows become
 * unclaimed (user_id NULL), inactive ("on hold") profiles that an admin
 * reviews and activates — the same mapping as the admin profile edit form
 * (photographer-profiles/actions.ts profileSchema).
 */

import type { createClient } from "@/lib/supabase/server";
import { isGoogleUrl, isYouTubeUrl, PHOTOGRAPHER_LANGUAGES, PHOTOGRAPHER_SERVICES } from "@/lib/photographer-options";
import { slugify } from "@/lib/slug";
import { BULK_IMPORT_MAX_CELL_LENGTH } from "./limits";
import type { BulkImportSheetConfig, ParsedSheetRow } from "./parser";
import type { BulkImportValidationResult, RowProblem, RowStatus, ValidatedRow } from "./types";
import { checkCountryStateSelection, normalizeName } from "./validate";

export const PHOTOGRAPHER_IMPORT_VERSION = "1.1";
export const PHOTOGRAPHER_IMPORT_INSERT_BATCH_SIZE = 100;

export type PhotographerColumn = {
  key: string;
  label: string;
  required: boolean;
  width: number;
  /** Controlled single-value dropdown shown in the template. */
  options?: readonly string[];
  note?: string;
};

const YES_NO = ["Yes", "No"] as const;

export const PHOTOGRAPHER_COLUMNS: readonly PhotographerColumn[] = [
  { key: "display_name", label: "Full Name", required: true, width: 24 },
  { key: "studio_name", label: "Photography Studio Name", required: true, width: 28 },
  { key: "city", label: "City", required: true, width: 18 },
  { key: "phone_number", label: "Phone Number", required: true, width: 18 },
  { key: "whatsapp_number", label: "WhatsApp Number", required: true, width: 18 },
  { key: "bio", label: "Bio", required: false, width: 60 },
  { key: "instagram_url", label: "Instagram URL", required: false, width: 34, note: "https:// link." },
  { key: "youtube_url", label: "YouTube URL", required: false, width: 34, note: "https://youtube.com or youtu.be link." },
  { key: "portfolio_url", label: "Portfolio URL", required: false, width: 34, note: "https:// link." },
  { key: "google_business_url", label: "Google Business Profile Link", required: false, width: 38, note: "https:// Google link (g.page, google.com, goo.gl)." },
  { key: "google_maps_url", label: "Google Maps Link", required: false, width: 38, note: "https:// Google Maps link to the business address." },
  { key: "experience_years", label: "Experience (Years)", required: false, width: 18, note: "Whole number 0-60." },
  {
    key: "services",
    label: "Services",
    required: false,
    width: 36,
    note: `Comma separated, from: ${PHOTOGRAPHER_SERVICES.join(" | ")}.`,
  },
  {
    key: "languages",
    label: "Languages",
    required: false,
    width: 28,
    note: `Comma separated, from: ${PHOTOGRAPHER_LANGUAGES.join(" | ")}.`,
  },
  { key: "travels_to_other_cities", label: "Travels to Other Cities", required: false, width: 22, options: YES_NO, note: "Blank = No." },
  { key: "offers_pre_wedding", label: "Offers Pre-Wedding", required: false, width: 20, options: YES_NO, note: "Blank = Yes." },
  { key: "offers_wedding", label: "Offers Wedding", required: false, width: 18, options: YES_NO, note: "Blank = No." },
];

export const PHOTOGRAPHER_SHEET_CONFIG: BulkImportSheetConfig = {
  sheetName: "Photographers",
  columns: PHOTOGRAPHER_COLUMNS,
  version: PHOTOGRAPHER_IMPORT_VERSION,
};

const PHONE_REGEX = /^[\d+\s-]{7,20}$/;
const MAX_LENGTH: Record<string, number> = {
  display_name: 200,
  studio_name: 200,
  city: 100,
  bio: 1000,
};

/** Same comparison the DB unique index uses: last 10 digits. */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Identity of a profile for duplicate detection: studio + city + state. */
export function photographerIdentityKey(studio: string, city: string, stateId: string): string {
  return `${normalizeName(studio)}|${slugify(city)}|${stateId}`;
}

export type PhotographerReference = {
  countryId: string;
  stateId: string;
  existingIdentityKeys: Set<string>;
  existingPhoneKeys: Set<string>;
};

export type PhotographerFields = {
  display_name: string;
  studio_name: string;
  city: string;
  phone_number: string;
  whatsapp_number: string;
  bio: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  portfolio_url: string | null;
  google_business_url: string | null;
  google_maps_url: string | null;
  experience_years: number | null;
  services: string[];
  languages: string[];
  travels_to_other_cities: boolean;
  offers_pre_wedding: boolean;
  offers_wedding: boolean;
};

const labelFor = (key: string) => PHOTOGRAPHER_COLUMNS.find((c) => c.key === key)?.label ?? key;

function parseList(raw: string, allowed: readonly string[], key: string, errors: RowProblem[]): string[] {
  if (raw === "") return [];
  const byLower = new Map(allowed.map((value) => [value.toLowerCase(), value]));
  const picked = new Set<string>();
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (item === "") continue;
    const match = byLower.get(item.toLowerCase());
    if (!match) {
      errors.push({
        field: labelFor(key),
        message: `'${item}' is not a valid option. Allowed: ${allowed.join(", ")}.`,
        kind: "error",
      });
    } else {
      picked.add(match);
    }
  }
  if (picked.size > 12) {
    errors.push({ field: labelFor(key), message: "At most 12 values are allowed.", kind: "error" });
  }
  return [...picked];
}

function parseYesNo(raw: string, key: string, fallback: boolean, errors: RowProblem[]): boolean {
  if (raw === "") return fallback;
  const value = raw.toLowerCase();
  if (value === "yes") return true;
  if (value === "no") return false;
  errors.push({ field: labelFor(key), message: "Must be Yes or No.", kind: "error" });
  return fallback;
}

function parseHttpsUrl(
  raw: string,
  key: string,
  errors: RowProblem[],
  extra?: { check: (url: string) => boolean; message: string },
): string | null {
  if (raw === "") return null;
  let ok = false;
  try {
    ok = new URL(raw).protocol === "https:";
  } catch {
    ok = false;
  }
  if (!ok) {
    errors.push({ field: labelFor(key), message: "Enter a valid https:// URL.", kind: "error" });
    return null;
  }
  if (extra && !extra.check(raw)) {
    errors.push({ field: labelFor(key), message: extra.message, kind: "error" });
    return null;
  }
  return raw;
}

/** Validates one row's own cells (no cross-row or database checks). */
function validateFields(row: ParsedSheetRow): { fields: PhotographerFields; errors: RowProblem[] } {
  const values = row.values;
  const errors: RowProblem[] = [];

  for (const column of PHOTOGRAPHER_COLUMNS) {
    const value = values[column.key];
    const max = MAX_LENGTH[column.key] ?? BULK_IMPORT_MAX_CELL_LENGTH;
    if (value.length > max) {
      errors.push({ field: column.label, message: `${column.label} must be ${max} characters or fewer.`, kind: "error" });
    }
    if (column.required && value === "") {
      errors.push({ field: column.label, message: `${column.label} is required.`, kind: "error" });
    }
  }

  for (const key of ["phone_number", "whatsapp_number"]) {
    if (values[key] !== "" && !PHONE_REGEX.test(values[key])) {
      errors.push({ field: labelFor(key), message: "Enter a valid phone number.", kind: "error" });
    }
  }

  let experienceYears: number | null = null;
  if (values.experience_years !== "") {
    const years = Number(values.experience_years);
    if (!Number.isInteger(years) || years < 0 || years > 60) {
      errors.push({ field: labelFor("experience_years"), message: "Must be a whole number from 0 to 60.", kind: "error" });
    } else {
      experienceYears = years;
    }
  }

  const fields: PhotographerFields = {
    display_name: values.display_name,
    studio_name: values.studio_name,
    city: values.city,
    phone_number: values.phone_number,
    whatsapp_number: values.whatsapp_number,
    bio: values.bio || null,
    instagram_url: parseHttpsUrl(values.instagram_url, "instagram_url", errors),
    youtube_url: parseHttpsUrl(values.youtube_url, "youtube_url", errors, {
      check: isYouTubeUrl,
      message: "Enter a youtube.com or youtu.be link.",
    }),
    portfolio_url: parseHttpsUrl(values.portfolio_url, "portfolio_url", errors),
    google_business_url: parseHttpsUrl(values.google_business_url, "google_business_url", errors, {
      check: isGoogleUrl,
      message: "Enter a Google link (g.page, google.com or goo.gl).",
    }),
    google_maps_url: parseHttpsUrl(values.google_maps_url, "google_maps_url", errors, {
      check: isGoogleUrl,
      message: "Enter a Google link (google.com/maps or maps.app.goo.gl).",
    }),
    experience_years: experienceYears,
    services: parseList(values.services, PHOTOGRAPHER_SERVICES, "services", errors),
    languages: parseList(values.languages, PHOTOGRAPHER_LANGUAGES, "languages", errors),
    travels_to_other_cities: parseYesNo(values.travels_to_other_cities, "travels_to_other_cities", false, errors),
    offers_pre_wedding: parseYesNo(values.offers_pre_wedding, "offers_pre_wedding", true, errors),
    offers_wedding: parseYesNo(values.offers_wedding, "offers_wedding", false, errors),
  };
  return { fields, errors };
}

/** Pure validation + classification. Row status reuses the locations
 * RowStatus: DUPLICATE_IN_FILE (same studio/city or phone twice in the file)
 * and EXISTING_LOCATION ("already exists" — studio/city or phone in the DB). */
export function validatePhotographerRows(
  rows: ParsedSheetRow[],
  reference: PhotographerReference,
): {
  result: BulkImportValidationResult;
  fieldsByRow: Map<number, PhotographerFields>;
} {
  const fieldsByRow = new Map<number, PhotographerFields>();
  const seenIdentity = new Map<string, number>();
  const seenPhone = new Map<string, number>();

  const validated: ValidatedRow[] = rows.map((row) => {
    const { fields, errors } = validateFields(row);
    fieldsByRow.set(row.excelRow, fields);
    let status: RowStatus = "NEW";

    if (errors.length > 0) {
      status = "INVALID";
    } else {
      const identity = photographerIdentityKey(fields.studio_name, fields.city, reference.stateId);
      const phone = phoneKey(fields.phone_number);
      const identityRow = seenIdentity.get(identity);
      const phoneRow = seenPhone.get(phone);

      if (identityRow !== undefined || phoneRow !== undefined) {
        status = "DUPLICATE_IN_FILE";
        errors.push({
          message: `Duplicate of row ${identityRow ?? phoneRow} in this file (same ${
            identityRow !== undefined ? "studio and city" : "phone number"
          }).`,
          kind: "error",
        });
      } else if (reference.existingIdentityKeys.has(identity)) {
        status = "EXISTING_LOCATION";
        errors.push({ message: "A photographer with this studio name already exists in this city.", kind: "error" });
      } else if (reference.existingPhoneKeys.has(phone)) {
        status = "EXISTING_LOCATION";
        errors.push({ message: "This phone number is already registered with another photographer.", kind: "error" });
      }
      if (status === "NEW") {
        seenIdentity.set(identity, row.excelRow);
        seenPhone.set(phone, row.excelRow);
      }
    }

    return {
      excelRow: row.excelRow,
      name: fields.studio_name || null,
      city: fields.city || null,
      status,
      problems: errors,
      notes: [],
      slug: null,
    };
  });

  const summary = { totalRows: validated.length, validRows: 0, warningRows: 0, errorRows: 0, duplicateRows: 0 };
  for (const row of validated) {
    if (row.status === "NEW") summary.validRows += 1;
    else if (row.status === "INVALID") summary.errorRows += 1;
    else summary.duplicateRows += 1;
  }

  return {
    result: { summary, rows: validated, workbookWarnings: [], templateVersion: null },
    fieldsByRow,
  };
}

export type PhotographerInsert = Record<string, string | number | boolean | string[] | null>;

export function buildPhotographerInsert(
  fields: PhotographerFields,
  ids: { countryId: string; stateId: string },
): PhotographerInsert {
  // user_id omitted (unclaimed); is_active omitted so the column default
  // (false = on hold / draft) applies; slug comes from the DB trigger.
  return { ...fields, country_id: ids.countryId, state_id: ids.stateId };
}

/** Narrow database seam so creation stays testable without a live database. */
export type PhotographerCreateDb = {
  /** One call = one transaction (a single multi-row INSERT). */
  insertProfiles(
    rows: PhotographerInsert[],
  ): Promise<{ data: { id: string; phone_number: string }[] } | { error: { message: string; code?: string } }>;
};

export type PhotographerCreateOutcome = {
  created: { excelRow: number; name: string; id: string }[];
  skipped: { excelRow: number; name: string | null; reason: string }[];
  failed: { excelRow: number; name: string | null; reason: string }[];
};

const UNIQUE_VIOLATION = "23505";

/** Creates unclaimed, inactive profiles for rows the freshly re-run
 * validation marked NEW. Every other row is reported, never written. */
export async function createDraftPhotographers(params: {
  db: PhotographerCreateDb;
  validatedRows: ValidatedRow[];
  fieldsByRow: Map<number, PhotographerFields>;
  reference: PhotographerReference;
}): Promise<PhotographerCreateOutcome> {
  const { db, validatedRows, fieldsByRow, reference } = params;
  const outcome: PhotographerCreateOutcome = { created: [], skipped: [], failed: [] };
  const prepared: { validated: ValidatedRow; insert: PhotographerInsert }[] = [];

  for (const validated of validatedRows) {
    const fields = fieldsByRow.get(validated.excelRow);
    if (validated.status === "NEW" && fields) {
      prepared.push({ validated, insert: buildPhotographerInsert(fields, reference) });
    } else if (validated.status === "INVALID") {
      outcome.failed.push({
        excelRow: validated.excelRow,
        name: validated.name,
        reason: validated.problems.find((p) => p.kind === "error")?.message ?? "Row is invalid.",
      });
    } else {
      outcome.skipped.push({
        excelRow: validated.excelRow,
        name: validated.name,
        reason: validated.problems[0]?.message ?? "Conflicts with an existing photographer.",
      });
    }
  }

  const record = (item: (typeof prepared)[number], id: string) =>
    outcome.created.push({ excelRow: item.validated.excelRow, name: item.validated.name ?? "", id });

  // A multi-row INSERT is atomic; if a batch fails (e.g. a phone registered
  // mid-import) nothing from it was written, so retry its rows one by one.
  for (let start = 0; start < prepared.length; start += PHOTOGRAPHER_IMPORT_INSERT_BATCH_SIZE) {
    const batch = prepared.slice(start, start + PHOTOGRAPHER_IMPORT_INSERT_BATCH_SIZE);
    const result = await db.insertProfiles(batch.map((item) => item.insert));

    if ("data" in result) {
      const idByPhone = new Map(result.data.map((row) => [phoneKey(row.phone_number), row.id]));
      for (const item of batch) {
        const id = idByPhone.get(phoneKey(String(item.insert.phone_number)));
        if (id) {
          record(item, id);
        } else {
          outcome.failed.push({
            excelRow: item.validated.excelRow,
            name: item.validated.name,
            reason: "The database did not confirm this row was created.",
          });
        }
      }
      continue;
    }

    for (const item of batch) {
      const single = await db.insertProfiles([item.insert]);
      const id = "data" in single ? single.data[0]?.id : undefined;
      if (id) {
        record(item, id);
      } else if ("error" in single && single.error.code === UNIQUE_VIOLATION) {
        outcome.skipped.push({
          excelRow: item.validated.excelRow,
          name: item.validated.name,
          reason: "Phone number already registered (created by someone else during the import).",
        });
      } else {
        outcome.failed.push({
          excelRow: item.validated.excelRow,
          name: item.validated.name,
          reason: "error" in single ? single.error.message : "The database did not confirm this row was created.",
        });
      }
    }
  }

  return outcome;
}

const PAGE = 1000;

/** Loads server-side reference data. The country/state selection is
 * re-verified against the database; existing identity/phone keys are read in
 * pages (PostgREST caps a response at 1000 rows). The DB unique phone index
 * remains the final guard at insert time. */
export async function loadPhotographerReference(
  supabase: Awaited<ReturnType<typeof createClient>>,
  countryId: string,
  stateId: string,
): Promise<{ ok: true; reference: PhotographerReference } | { ok: false; error: string }> {
  const [{ data: country }, { data: state }] = await Promise.all([
    supabase.from("countries").select("id").eq("id", countryId).maybeSingle(),
    supabase.from("states").select("id, country_id").eq("id", stateId).maybeSingle(),
  ]);
  const selection = checkCountryStateSelection(country, state);
  if (!selection.ok) return { ok: false, error: selection.error };

  const existingIdentityKeys = new Set<string>();
  const existingPhoneKeys = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("photographer_profiles")
      .select("studio_name, city, state_id, phone_number")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: "Could not load existing photographers." };
    for (const row of data ?? []) {
      existingPhoneKeys.add(phoneKey(row.phone_number));
      if (row.state_id === stateId) {
        existingIdentityKeys.add(photographerIdentityKey(row.studio_name, row.city, stateId));
      }
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  return { ok: true, reference: { countryId, stateId, existingIdentityKeys, existingPhoneKeys } };
}

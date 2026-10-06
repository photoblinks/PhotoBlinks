import { slugify } from "@/lib/slug";
import {
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_ENUMS,
  type BulkImportEnumKey,
} from "./schema";
import { BULK_IMPORT_MAX_CELL_LENGTH } from "./limits";
import type {
  BulkImportValidationResult,
  ParsedRow,
  RowProblem,
  RowStatus,
  ValidatedRow,
} from "./types";

/** Reference data loaded server-side by the route handler (never from the
 * client or the Excel file) and passed into the pure validator. */
export type BulkImportReference = {
  countryId: string;
  countryName: string;
  stateId: string;
  stateName: string;
  /** Active categories, keyed by normalized name (lowercase + whitespace). */
  categoriesByName: Map<string, { id: string; name: string }>;
  /** Cities in the selected state, keyed by normalized slug (slugify(name)). */
  citiesBySlug: Map<string, { id: string; name: string; slug: string }>;
  /** Normalized identity keys (name|citySlug|stateId) of existing locations. */
  existingLocationIdentityKeys: Set<string>;
  /** Existing location slugs (globally unique on the locations table). */
  existingSlugs: Set<string>;
};

/** Case/whitespace-insensitive normalization for names and categories. */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Identity key established in Phase 1: normalized location name + city slug
 * + state. The city is normalized by slug (matching the (state_id, slug)
 * unique key used by find_or_create_city), the name case/whitespace-only. */
export function identityKey(name: string, citySlug: string, stateId: string): string {
  return `${normalizeName(name)}|${citySlug}|${stateId}`;
}

/** Pure country/state selection check used by the validate route (mirrors
 * resolveLocationGeo's parentage rule). Extracted so the rule is testable. */
export function checkCountryStateSelection(
  country: { id: string } | null | undefined,
  state: { country_id: string } | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!country) return { ok: false, error: "Selected country could not be found." };
  if (!state) return { ok: false, error: "Selected state could not be found." };
  if (state.country_id !== country.id) {
    return { ok: false, error: "Selected state does not belong to the selected country." };
  }
  return { ok: true };
}

function parsePrice(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value)) {
    return { ok: false, message: "Price must be a number." };
  }
  if (value <= 0) {
    return { ok: false, message: "Price must be greater than 0." };
  }
  return { ok: true, value };
}

type FieldResult = {
  excelRow: number;
  name: string;
  city: string;
  /** Column-key → normalized stored value for enum/category fields. */
  resolved: Record<string, string>;
  errors: RowProblem[];
  warnings: RowProblem[];
};

/** Builds label→value reverse maps for every controlled enum set, once. */
function buildEnumMaps(): Map<BulkImportEnumKey, Map<string, string>> {
  const maps = new Map<BulkImportEnumKey, Map<string, string>>();
  for (const key of Object.keys(BULK_IMPORT_ENUMS) as BulkImportEnumKey[]) {
    const map = new Map<string, string>();
    for (const option of BULK_IMPORT_ENUMS[key]) {
      map.set(option.label.toLowerCase(), option.value);
    }
    maps.set(key, map);
  }
  return maps;
}

function validateFields(
  row: ParsedRow,
  reference: BulkImportReference,
  enumMaps: Map<BulkImportEnumKey, Map<string, string>>,
): FieldResult {
  const errors: RowProblem[] = [];
  const warnings: RowProblem[] = [];
  const resolved: Record<string, string> = {};
  const values = row.values;

  const labelFor = (key: string) =>
    BULK_IMPORT_COLUMNS.find((column) => column.key === key)?.label ?? key;

  for (const column of BULK_IMPORT_COLUMNS) {
    resolved[column.key] = values[column.key];

    // Cell length bound (resource-safety / hostile-input guard).
    if (values[column.key].length > BULK_IMPORT_MAX_CELL_LENGTH) {
      errors.push({
        field: column.label,
        message: `${column.label} exceeds the maximum length of ${BULK_IMPORT_MAX_CELL_LENGTH} characters.`,
        kind: "error",
      });
    }

    // Required fields.
    if (column.required && values[column.key] === "") {
      errors.push({ field: column.label, message: `${column.label} is required.`, kind: "error" });
    }

    // Controlled enum fields — exact approved values only (case-insensitive).
    if (column.type === "enum" && column.enumKey && values[column.key] !== "") {
      const value = enumMaps.get(column.enumKey)?.get(values[column.key].toLowerCase());
      if (value === undefined) {
        const allowed = BULK_IMPORT_ENUMS[column.enumKey].map((option) => option.label).join(", ");
        errors.push({
          field: column.label,
          message: `${column.label} must be one of: ${allowed}.`,
          kind: "error",
        });
      } else {
        resolved[column.key] = value;
      }
    }

    // Category is a display name in Excel; resolve it against active categories.
    if (column.type === "category" && values[column.key] !== "") {
      const category = reference.categoriesByName.get(normalizeName(values[column.key]));
      if (!category) {
        errors.push({
          field: column.label,
          message: `'${values[column.key]}' is not a valid category.`,
          kind: "error",
        });
      } else {
        resolved[column.key] = category.name;
      }
    }
  }

  // Price rule.
  const pricing = resolved.pricing_type;
  if (pricing === "paid") {
    if (values.price === "") {
      errors.push({
        field: labelFor("price"),
        message: "Price is required when Pricing is Paid.",
        kind: "error",
      });
    } else {
      const price = parsePrice(values.price);
      if (!price.ok) errors.push({ field: labelFor("price"), message: price.message, kind: "error" });
    }
  } else if (pricing !== "" && pricing !== "paid" && values.price !== "") {
    warnings.push({
      field: labelFor("price"),
      message: "Price is ignored because Pricing is not Paid.",
      kind: "warning",
    });
  }

  // Pre-Wedding Shoot condition rule.
  const preWeddingShoot = resolved.pre_wedding_shoot;
  if (preWeddingShoot === "conditional") {
    if (values.pre_wedding_shoot_condition === "") {
      errors.push({
        field: labelFor("pre_wedding_shoot_condition"),
        message: "Pre-Wedding Shoot Condition is required when Pre-Wedding Shoot is Conditional.",
        kind: "error",
      });
    }
  } else if (
    preWeddingShoot !== "" &&
    preWeddingShoot !== "conditional" &&
    values.pre_wedding_shoot_condition !== ""
  ) {
    warnings.push({
      field: labelFor("pre_wedding_shoot_condition"),
      message: "Pre-Wedding Shoot Condition is ignored because Pre-Wedding Shoot is not Conditional.",
      kind: "warning",
    });
  }

  // Drone Permission rule.
  const droneStatus = resolved.drone_status;
  const droneNeedsPermission =
    droneStatus === "allowed_with_permission" || droneStatus === "restricted";
  if (droneNeedsPermission) {
    if (values.drone_permission === "") {
      errors.push({
        field: labelFor("drone_permission"),
        message: "Drone Permission is required when Drone Status is Allowed with Permission or Restricted.",
        kind: "error",
      });
    }
  } else if (droneStatus !== "" && !droneNeedsPermission && values.drone_permission !== "") {
    warnings.push({
      field: labelFor("drone_permission"),
      message: "Drone Permission is ignored because Drone Status does not require permission.",
      kind: "warning",
    });
  }

  return {
    excelRow: row.excelRow,
    name: values.name,
    city: values.city_name,
    resolved,
    errors,
    warnings,
  };
}

/**
 * Validates parsed rows against the locked contract and the current reference
 * data, then classifies each row. Pure with respect to the database: every
 * lookup is fed in through `reference`, so this is unit-testable and performs
 * no writes, no N+1 queries, and no network I/O of its own.
 */
export function validateBulkImportRows(
  rows: ParsedRow[],
  reference: BulkImportReference,
): BulkImportValidationResult {
  return validateBulkImportRowsDetailed(rows, reference).result;
}

/** Same as validateBulkImportRows, but also returns each row's normalized
 * field values (enum codes, canonical category name) keyed by Excel row so the
 * Phase 4 creator builds inserts from server-validated data only. */
export function validateBulkImportRowsDetailed(
  rows: ParsedRow[],
  reference: BulkImportReference,
): { result: BulkImportValidationResult; resolvedByRow: Map<number, Record<string, string>> } {
  const enumMaps = buildEnumMaps();
  const fieldResults = rows.map((row) => validateFields(row, reference, enumMaps));

  // Identity / slug detection runs only on error-free rows, so an invalid row
  // is reported as INVALID rather than spuriously "duplicate".
  const clean = fieldResults.filter((result) => result.errors.length === 0);

  const identityFirstRow = new Map<string, number>();
  const duplicateOf = new Map<number, number>();
  for (const result of clean) {
    const key = identityKey(result.name, slugify(result.city), reference.stateId);
    const firstRow = identityFirstRow.get(key);
    if (firstRow !== undefined) {
      duplicateOf.set(result.excelRow, firstRow);
    } else {
      identityFirstRow.set(key, result.excelRow);
    }
  }

  // Slug owners among clean rows — first row claiming each would-be slug.
  const slugOwner = new Map<string, { identity: string; excelRow: number }>();
  for (const result of clean) {
    const slug = slugify(result.name);
    if (slug === "") continue;
    const identity = identityKey(result.name, slugify(result.city), reference.stateId);
    if (!slugOwner.has(slug)) slugOwner.set(slug, { identity, excelRow: result.excelRow });
  }

  const validatedRows: ValidatedRow[] = fieldResults.map((result) => {
    const errors = [...result.errors];
    const notes: string[] = [];
    const name = result.name;
    const city = result.city;
    const slug = name.trim() !== "" ? slugify(name) : "";
    let status: RowStatus;

    if (errors.length > 0) {
      status = "INVALID";
    } else {
      const key = identityKey(name, slugify(city), reference.stateId);

      const inFileDuplicate = duplicateOf.get(result.excelRow);
      if (inFileDuplicate !== undefined) {
        status = "DUPLICATE_IN_FILE";
        errors.push({
          message: `Duplicate of row ${inFileDuplicate} in this file (same name, city, and state).`,
          kind: "error",
        });
      } else if (reference.existingLocationIdentityKeys.has(key)) {
        status = "EXISTING_LOCATION";
        errors.push({
          message: "A location with this name already exists in this city.",
          kind: "error",
        });
      } else if (slug !== "" && reference.existingSlugs.has(slug)) {
        status = "SLUG_CONFLICT";
        errors.push({ message: `The slug '${slug}' is already in use.`, kind: "error" });
      } else {
        const owner = slug !== "" ? slugOwner.get(slug) : undefined;
        if (owner && owner.identity !== key) {
          status = "SLUG_CONFLICT";
          errors.push({
            message: `The slug '${slug}' collides with row ${owner.excelRow} in this file.`,
            kind: "error",
          });
        } else if (result.warnings.length > 0) {
          status = "WARNING";
        } else {
          status = "NEW";
        }
      }

      // City resolution (read-only): report whether the city would be created.
      if (city.trim() !== "") {
        const citySlug = slugify(city);
        if (citySlug !== "" && !reference.citiesBySlug.has(citySlug)) {
          notes.push(`City '${city.trim()}' does not exist yet — it will be created during import.`);
        }
      }
    }

    return {
      excelRow: result.excelRow,
      name: name.trim() !== "" ? name : null,
      city: city.trim() !== "" ? city : null,
      status,
      problems: [...errors, ...result.warnings],
      notes,
      slug: slug !== "" ? slug : null,
    };
  });

  const summary = {
    totalRows: validatedRows.length,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    duplicateRows: 0,
  };
  for (const row of validatedRows) {
    switch (row.status) {
      case "NEW":
        summary.validRows += 1;
        break;
      case "WARNING":
        summary.warningRows += 1;
        break;
      case "INVALID":
        summary.errorRows += 1;
        break;
      case "DUPLICATE_IN_FILE":
      case "EXISTING_LOCATION":
      case "SLUG_CONFLICT":
        summary.duplicateRows += 1;
        break;
    }
  }

  const resolvedByRow = new Map<number, Record<string, string>>();
  for (const fieldResult of fieldResults) resolvedByRow.set(fieldResult.excelRow, fieldResult.resolved);

  return {
    result: { summary, rows: validatedRows, workbookWarnings: [], templateVersion: null },
    resolvedByRow,
  };
}

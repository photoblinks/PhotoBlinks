import { slugify } from "@/lib/slug";
import { BULK_IMPORT_COLUMNS } from "./schema";
import { normalizeName, type BulkImportReference } from "./validate";
import type { ParsedRow, ValidatedRow } from "./types";

export const BULK_IMPORT_INSERT_BATCH_SIZE = 100;

/** Columns copied verbatim (blank → omitted, so the column default applies —
 * same as the manual form). Identity/geo/category/price/publish are handled
 * explicitly in buildLocationInsert and never read from the workbook. */
const PASSTHROUGH_KEYS = BULK_IMPORT_COLUMNS.map((column) => column.key).filter(
  (key) =>
    ![
      "name",
      "city_name",
      "category_id",
      "pricing_type",
      "price",
      "pre_wedding_shoot_condition",
      "drone_permission",
    ].includes(key),
);

export type LocationInsert = Record<string, string | number | boolean>;

/** Maps one server-validated row to a `locations` insert. Country, state,
 * city, category and slug come from server-resolved values; `is_published`
 * is always false. Conditional fields are dropped when their trigger value is
 * not selected (Phase 3 warned about them). */
export function buildLocationInsert(
  values: ParsedRow["values"],
  resolved: Record<string, string>,
  ids: { countryId: string; stateId: string; cityId: string; categoryId: string },
): LocationInsert {
  const insert: LocationInsert = {
    name: values.name,
    slug: slugify(values.name),
    country_id: ids.countryId,
    state_id: ids.stateId,
    city_id: ids.cityId,
    category_id: ids.categoryId,
    pricing_type: resolved.pricing_type,
    is_published: false,
  };

  if (resolved.pricing_type === "paid") insert.price = Number(values.price);

  for (const key of PASSTHROUGH_KEYS) {
    const value = resolved[key];
    if (value !== "") insert[key] = value;
  }
  if (resolved.pre_wedding_shoot === "conditional") {
    insert.pre_wedding_shoot_condition = values.pre_wedding_shoot_condition;
  }
  if (resolved.drone_status === "allowed_with_permission" || resolved.drone_status === "restricted") {
    insert.drone_permission = values.drone_permission;
  }
  return insert;
}

/** Narrow database seam so creation is testable without a live database. */
export type BulkCreateDb = {
  findOrCreateCity(stateId: string, name: string): Promise<{ id: string } | { error: string }>;
  /** One call = one transaction (a single multi-row INSERT). */
  insertLocations(
    rows: LocationInsert[],
  ): Promise<{ data: { id: string; slug: string }[] } | { error: { message: string; code?: string } }>;
};

export type CreateOutcome = {
  created: { excelRow: number; name: string; id: string }[];
  skipped: { excelRow: number; name: string | null; reason: string }[];
  failed: { excelRow: number; name: string | null; reason: string }[];
};

const UNIQUE_VIOLATION = "23505";

/** Creates draft locations for rows that the (freshly re-run) validation
 * classified NEW/WARNING. Every other row is skipped and reported — nothing
 * is updated, overwritten, or published. */
export async function createDraftLocations(params: {
  db: BulkCreateDb;
  rows: ParsedRow[];
  validatedRows: ValidatedRow[];
  resolvedByRow: Map<number, Record<string, string>>;
  reference: BulkImportReference;
}): Promise<CreateOutcome> {
  const { db, rows, validatedRows, resolvedByRow, reference } = params;
  const outcome: CreateOutcome = { created: [], skipped: [], failed: [] };
  const parsedByRow = new Map(rows.map((row) => [row.excelRow, row]));

  const eligible: ValidatedRow[] = [];
  for (const validated of validatedRows) {
    if (validated.status === "NEW" || validated.status === "WARNING") {
      eligible.push(validated);
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
        reason: validated.problems[0]?.message ?? "Conflicts with an existing location.",
      });
    }
  }

  // Resolve each unique city once: existing cities come from the reference,
  // new ones through find_or_create_city (the existing atomic function).
  const cityIdBySlug = new Map<string, string>();
  const cityError = new Map<string, string>();
  for (const [slug, city] of reference.citiesBySlug) cityIdBySlug.set(slug, city.id);
  for (const validated of eligible) {
    const citySlug = slugify(validated.city ?? "");
    if (cityIdBySlug.has(citySlug) || cityError.has(citySlug)) continue;
    const city = await db.findOrCreateCity(reference.stateId, validated.city ?? "");
    if ("error" in city) cityError.set(citySlug, city.error);
    else cityIdBySlug.set(citySlug, city.id);
  }

  const prepared: { validated: ValidatedRow; insert: LocationInsert }[] = [];
  for (const validated of eligible) {
    const parsed = parsedByRow.get(validated.excelRow);
    const resolved = resolvedByRow.get(validated.excelRow);
    const citySlug = slugify(validated.city ?? "");
    const cityId = cityIdBySlug.get(citySlug);
    const category = resolved
      ? reference.categoriesByName.get(normalizeName(resolved.category_id))
      : undefined;

    if (!parsed || !resolved || !category) {
      outcome.failed.push({
        excelRow: validated.excelRow,
        name: validated.name,
        reason: "Category could not be resolved.",
      });
    } else if (!cityId) {
      outcome.failed.push({
        excelRow: validated.excelRow,
        name: validated.name,
        reason: cityError.get(citySlug) ?? "City could not be resolved.",
      });
    } else {
      prepared.push({
        validated,
        insert: buildLocationInsert(parsed.values, resolved, {
          countryId: reference.countryId,
          stateId: reference.stateId,
          cityId,
          categoryId: category.id,
        }),
      });
    }
  }

  const recordCreated = (item: (typeof prepared)[number], id: string) =>
    outcome.created.push({ excelRow: item.validated.excelRow, name: item.validated.name ?? "", id });

  // One multi-row INSERT per batch is atomic. If a batch fails (e.g. a slug
  // created by another employee mid-import), nothing from it was written, so
  // retry its rows one by one to isolate the failure precisely.
  for (let start = 0; start < prepared.length; start += BULK_IMPORT_INSERT_BATCH_SIZE) {
    const batch = prepared.slice(start, start + BULK_IMPORT_INSERT_BATCH_SIZE);
    const result = await db.insertLocations(batch.map((item) => item.insert));

    if ("data" in result) {
      const idBySlug = new Map(result.data.map((row) => [row.slug, row.id]));
      for (const item of batch) {
        const id = idBySlug.get(String(item.insert.slug));
        if (id) {
          recordCreated(item, id);
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
      const single = await db.insertLocations([item.insert]);
      const id = "data" in single ? single.data[0]?.id : undefined;
      if (id) {
        recordCreated(item, id);
      } else if ("error" in single && single.error.code === UNIQUE_VIOLATION) {
        outcome.skipped.push({
          excelRow: item.validated.excelRow,
          name: item.validated.name,
          reason: "Already exists (created by someone else during the import).",
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

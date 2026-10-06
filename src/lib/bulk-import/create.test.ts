import { test } from "node:test";
import assert from "node:assert/strict";
import { BULK_IMPORT_COLUMNS } from "./schema";
import { validateBulkImportRowsDetailed, type BulkImportReference } from "./validate";
import {
  BULK_IMPORT_INSERT_BATCH_SIZE,
  createDraftLocations,
  type BulkCreateDb,
  type LocationInsert,
} from "./create";
import type { ParsedRow } from "./types";

// Pure tests: the database seam (BulkCreateDb) is faked. These do NOT exercise
// Postgres, RLS, or find_or_create_city.

const ALL_KEYS = BULK_IMPORT_COLUMNS.map((column) => column.key);

function makeRow(excelRow: number, overrides: Record<string, string> = {}): ParsedRow {
  const values: Record<string, string> = {};
  for (const key of ALL_KEYS) values[key] = "";
  Object.assign(values, {
    name: "Varkala Cliff",
    card_name: "Varkala Cliff",
    city_name: "Kochi",
    category_id: "Beach",
    pricing_type: "Free",
    ...overrides,
  });
  return { excelRow, values: values as ParsedRow["values"] };
}

function makeReference(overrides: Partial<BulkImportReference> = {}): BulkImportReference {
  return {
    countryId: "country-1",
    countryName: "India",
    stateId: "state-1",
    stateName: "Kerala",
    categoriesByName: new Map([["beach", { id: "cat-beach", name: "Beach" }]]),
    citiesBySlug: new Map([["kochi", { id: "city-kochi", name: "Kochi", slug: "kochi" }]]),
    existingLocationIdentityKeys: new Set(),
    existingSlugs: new Set(),
    ...overrides,
  };
}

type FakeDb = BulkCreateDb & { inserted: LocationInsert[][]; cityCalls: string[] };

function makeDb(opts: {
  existingSlugs?: Set<string>;
  failSlugs?: Set<string>;
  cityError?: boolean;
} = {}): FakeDb {
  const inserted: LocationInsert[][] = [];
  const cityCalls: string[] = [];
  const taken = new Set(opts.existingSlugs ?? []);
  return {
    inserted,
    cityCalls,
    async findOrCreateCity(_stateId, name) {
      cityCalls.push(name);
      return opts.cityError ? { error: "city boom" } : { id: `city-${name}` };
    },
    async insertLocations(rows) {
      inserted.push(rows);
      // Whole-statement atomicity: any bad row rejects the entire insert.
      for (const row of rows) {
        if (taken.has(String(row.slug))) {
          return { error: { message: "duplicate key", code: "23505" } };
        }
        if (opts.failSlugs?.has(String(row.slug))) {
          return { error: { message: "check constraint", code: "23514" } };
        }
      }
      for (const row of rows) taken.add(String(row.slug));
      return { data: rows.map((row, i) => ({ id: `id-${String(row.slug)}-${i}`, slug: String(row.slug) })) };
    },
  };
}

async function run(rows: ParsedRow[], db: BulkCreateDb, reference = makeReference()) {
  const { result, resolvedByRow } = validateBulkImportRowsDetailed(rows, reference);
  const outcome = await createDraftLocations({
    db,
    rows,
    validatedRows: result.rows,
    resolvedByRow,
    reference,
  });
  return outcome;
}

test("one valid row creates one draft", async () => {
  const db = makeDb();
  const outcome = await run([makeRow(2)], db);
  assert.equal(outcome.created.length, 1);
  assert.equal(db.inserted.flat().length, 1);
});

test("multiple valid rows create multiple drafts in one batch", async () => {
  const db = makeDb();
  const outcome = await run([makeRow(2), makeRow(3, { name: "Fort Kochi", card_name: "Fort Kochi" })], db);
  assert.equal(outcome.created.length, 2);
  assert.equal(db.inserted.length, 1);
});

test("is_published is always false", async () => {
  const db = makeDb();
  await run([makeRow(2)], db);
  assert.equal(db.inserted[0][0].is_published, false);
});

test("category id, country, state, slug are server-resolved", async () => {
  const db = makeDb();
  await run([makeRow(2, { category_id: "  BEACH " })], db);
  const insert = db.inserted[0][0];
  assert.equal(insert.category_id, "cat-beach");
  assert.equal(insert.country_id, "country-1");
  assert.equal(insert.state_id, "state-1");
  assert.equal(insert.slug, "varkala-cliff");
  assert.equal(insert.city_id, "city-kochi");
});

test("unknown category cannot reach creation", async () => {
  const db = makeDb();
  const outcome = await run([makeRow(2, { category_id: "Volcano" })], db);
  assert.equal(outcome.created.length, 0);
  assert.equal(outcome.failed.length, 1);
  assert.equal(db.inserted.length, 0);
});

test("existing city is reused without find_or_create_city", async () => {
  const db = makeDb();
  await run([makeRow(2, { city_name: " kochi " })], db);
  assert.equal(db.cityCalls.length, 0);
  assert.equal(db.inserted[0][0].city_id, "city-kochi");
});

test("new city is created once for many rows", async () => {
  const db = makeDb();
  await run(
    [
      makeRow(2, { city_name: "Varkala" }),
      makeRow(3, { name: "Papanasam", card_name: "P", city_name: "varkala" }),
    ],
    db,
  );
  assert.deepEqual(db.cityCalls, ["Varkala"]);
});

test("city failure fails the row and creates nothing", async () => {
  const db = makeDb({ cityError: true });
  const outcome = await run([makeRow(2, { city_name: "Varkala" })], db);
  assert.equal(outcome.created.length, 0);
  assert.equal(outcome.failed[0].reason, "city boom");
  assert.equal(db.inserted.length, 0);
});

test("existing location is skipped, never overwritten", async () => {
  const db = makeDb();
  const reference = makeReference({
    existingLocationIdentityKeys: new Set(["varkala cliff|kochi|state-1"]),
    existingSlugs: new Set(["varkala-cliff"]),
  });
  const outcome = await run([makeRow(2)], db, reference);
  assert.equal(outcome.skipped.length, 1);
  assert.equal(outcome.created.length, 0);
  assert.equal(db.inserted.length, 0);
});

test("existing slug conflict is skipped", async () => {
  const db = makeDb();
  const reference = makeReference({ existingSlugs: new Set(["varkala-cliff"]) });
  const outcome = await run([makeRow(2, { city_name: "Munnar" })], db, reference);
  assert.equal(outcome.skipped.length, 1);
  assert.equal(db.inserted.length, 0);
});

test("duplicate rows in the same import are not duplicated", async () => {
  const db = makeDb();
  const outcome = await run([makeRow(2), makeRow(3)], db);
  assert.equal(outcome.created.length, 1);
  assert.equal(outcome.skipped.length, 1);
  assert.equal(db.inserted.flat().length, 1);
});

test("invalid rows cannot reach creation", async () => {
  const db = makeDb();
  const outcome = await run([makeRow(2, { name: "" })], db);
  assert.equal(outcome.failed.length, 1);
  assert.equal(db.inserted.length, 0);
});

test("paid location receives price; free location does not", async () => {
  const db = makeDb();
  await run(
    [
      makeRow(2, { pricing_type: "Paid", price: "1500" }),
      makeRow(3, { name: "Free Spot", card_name: "F", price: "99" }),
    ],
    db,
  );
  const [paid, free] = db.inserted[0];
  assert.equal(paid.price, 1500);
  assert.equal(paid.pricing_type, "paid");
  assert.equal("price" in free, false);
});

test("conditional fields map only when their trigger is selected", async () => {
  const db = makeDb();
  await run(
    [
      makeRow(2, {
        pre_wedding_shoot: "Conditional",
        pre_wedding_shoot_condition: "Permit needed",
        drone_status: "Restricted",
        drone_permission: "Apply to forest dept",
        parking_facility: "Available",
        vehicle_parking_fee: "50",
      }),
      makeRow(3, {
        name: "Other",
        card_name: "O",
        pre_wedding_shoot: "Allowed",
        pre_wedding_shoot_condition: "ignored",
        drone_status: "Allowed",
        drone_permission: "ignored",
      }),
    ],
    db,
    makeReference(),
  );
  // Row 3 has warnings -> still created (acknowledgement is enforced by the route).
  const [first, second] = db.inserted[0];
  assert.equal(first.pre_wedding_shoot, "conditional");
  assert.equal(first.pre_wedding_shoot_condition, "Permit needed");
  assert.equal(first.drone_status, "restricted");
  assert.equal(first.drone_permission, "Apply to forest dept");
  assert.equal(first.parking_facility, "available");
  assert.equal(first.vehicle_parking_fee, "50");
  assert.equal("pre_wedding_shoot_condition" in second, false);
  assert.equal("drone_permission" in second, false);
});

test("only contract columns reach the insert (no id/images/faqs/seo)", async () => {
  const db = makeDb();
  await run([makeRow(2)], db);
  const allowed = new Set([
    ...ALL_KEYS,
    "slug",
    "country_id",
    "state_id",
    "city_id",
    "is_published",
  ]);
  for (const key of Object.keys(db.inserted[0][0])) assert.ok(allowed.has(key), key);
});

test("retry after success creates no duplicates", async () => {
  const db = makeDb();
  const rows = [makeRow(2)];
  const first = await run(rows, db);
  assert.equal(first.created.length, 1);
  // Retry: the re-check now sees the row that exists.
  const reference = makeReference({
    existingLocationIdentityKeys: new Set(["varkala cliff|kochi|state-1"]),
    existingSlugs: new Set(["varkala-cliff"]),
  });
  const second = await run(rows, db, reference);
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(db.inserted.flat().length, 1);
});

test("race: slug taken after re-check is skipped via DB uniqueness, others still created", async () => {
  const db = makeDb({ existingSlugs: new Set(["varkala-cliff"]) });
  const outcome = await run(
    [makeRow(2), makeRow(3, { name: "Fort Kochi", card_name: "F" })],
    db,
  );
  assert.equal(outcome.created.length, 1);
  assert.equal(outcome.created[0].name, "Fort Kochi");
  assert.equal(outcome.skipped.length, 1);
  assert.equal(outcome.skipped[0].excelRow, 2);
});

test("unexpected DB error is reported as failed with a reason; rest still created", async () => {
  const db = makeDb({ failSlugs: new Set(["bad-one"]) });
  const outcome = await run(
    [makeRow(2, { name: "Bad One", card_name: "B" }), makeRow(3, { name: "Good One", card_name: "G" })],
    db,
  );
  assert.equal(outcome.created.length, 1);
  assert.equal(outcome.failed.length, 1);
  assert.equal(outcome.failed[0].excelRow, 2);
  assert.match(outcome.failed[0].reason, /check constraint/);
});

test("large import is inserted in bounded batches", async () => {
  const db = makeDb();
  const count = BULK_IMPORT_INSERT_BATCH_SIZE * 2 + 5;
  const rows = Array.from({ length: count }, (_, i) =>
    makeRow(i + 2, { name: `Place ${i}`, card_name: `P${i}` }),
  );
  const outcome = await run(rows, db);
  assert.equal(outcome.created.length, count);
  assert.equal(db.inserted.length, 3);
  assert.ok(db.inserted.every((batch) => batch.length <= BULK_IMPORT_INSERT_BATCH_SIZE));
});

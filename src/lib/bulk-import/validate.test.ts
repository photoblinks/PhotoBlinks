import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "@/lib/slug";
import { BULK_IMPORT_COLUMNS } from "./schema";
import {
  checkCountryStateSelection,
  identityKey,
  validateBulkImportRows,
  type BulkImportReference,
} from "./validate";
import type { ParsedRow } from "./types";

const ALL_KEYS = BULK_IMPORT_COLUMNS.map((column) => column.key);

function makeRow(excelRow: number, overrides: Record<string, string> = {}): ParsedRow {
  const values: Record<string, string> = {};
  for (const key of ALL_KEYS) values[key] = "";
  for (const [key, value] of Object.entries(overrides)) values[key] = value;
  return { excelRow, values: values as ParsedRow["values"] };
}

function makeReference(overrides: Partial<BulkImportReference> = {}): BulkImportReference {
  return {
    countryId: "country-1",
    countryName: "India",
    stateId: "state-1",
    stateName: "Kerala",
    categoriesByName: new Map([
      ["beach", { id: "cat-beach", name: "Beach" }],
      ["temple", { id: "cat-temple", name: "Temple" }],
    ]),
    citiesBySlug: new Map([["kochi", { id: "city-kochi", name: "Kochi", slug: "kochi" }]]),
    existingLocationIdentityKeys: new Set(),
    existingSlugs: new Set(),
    ...overrides,
  };
}

const VALID_OVERRIDES = {
  name: "Varkala Cliff",
  card_name: "Varkala Cliff",
  city_name: "Kochi",
  category_id: "Beach",
  pricing_type: "Free",
};

test("valid row is classified NEW", () => {
  const result = validateBulkImportRows([makeRow(2, VALID_OVERRIDES)], makeReference());
  assert.equal(result.summary.totalRows, 1);
  assert.equal(result.summary.validRows, 1);
  assert.equal(result.rows[0].status, "NEW");
  assert.equal(result.rows[0].problems.length, 0);
});

test("multiple valid rows are all NEW", () => {
  const result = validateBulkImportRows(
    [makeRow(2, VALID_OVERRIDES), makeRow(3, { ...VALID_OVERRIDES, name: "Fort Kochi", card_name: "Fort Kochi" })],
    makeReference(),
  );
  assert.equal(result.summary.totalRows, 2);
  assert.equal(result.summary.validRows, 2);
});

test("blank optional fields stay valid", () => {
  const result = validateBulkImportRows([makeRow(2, VALID_OVERRIDES)], makeReference());
  assert.equal(result.rows[0].status, "NEW");
});

test("missing required field is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, name: "" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Location Name is required")));
});

test("invalid category is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, category_id: "Desert" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("not a valid category")));
});

test("invalid Pricing is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, pricing_type: "Sometimes" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Pricing must be one of")));
});

test("Paid without Price is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, pricing_type: "Paid", price: "" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Price is required")));
});

test("Paid with non-numeric Price is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, pricing_type: "Paid", price: "abc" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Price must be a number")));
});

test("Conditional Pre-Wedding Shoot without condition is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, pre_wedding_shoot: "Conditional", pre_wedding_shoot_condition: "" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(
    result.rows[0].problems.some((p) => p.message.includes("Pre-Wedding Shoot Condition is required")),
  );
});

test("Drone Permission missing when required is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, drone_status: "Allowed with Permission", drone_permission: "" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Drone Permission is required")));
});

test("invalid controlled Drone Status is INVALID", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, drone_status: "Sometimes" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "INVALID");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Drone Status must be one of")));
});

test("duplicate rows inside the file are DUPLICATE_IN_FILE", () => {
  const result = validateBulkImportRows(
    [
      makeRow(2, VALID_OVERRIDES),
      makeRow(3, { ...VALID_OVERRIDES, card_name: "Varkala" }),
    ],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "NEW");
  assert.equal(result.rows[1].status, "DUPLICATE_IN_FILE");
  assert.equal(result.summary.duplicateRows, 1);
});

test("existing location is EXISTING_LOCATION", () => {
  const reference = makeReference({
    existingLocationIdentityKeys: new Set([identityKey("Varkala Cliff", "kochi", "state-1")]),
  });
  const result = validateBulkImportRows([makeRow(2, VALID_OVERRIDES)], reference);
  assert.equal(result.rows[0].status, "EXISTING_LOCATION");
});

test("slug already in use is SLUG_CONFLICT", () => {
  const reference = makeReference({
    existingSlugs: new Set([slugify("Varkala Cliff")]),
  });
  const result = validateBulkImportRows([makeRow(2, VALID_OVERRIDES)], reference);
  assert.equal(result.rows[0].status, "SLUG_CONFLICT");
});

test("two rows producing the same slug collide", () => {
  const result = validateBulkImportRows(
    [
      makeRow(2, VALID_OVERRIDES),
      makeRow(3, { ...VALID_OVERRIDES, name: "Varkala-Cliff", card_name: "Varkala-Cliff" }),
    ],
    makeReference(),
  );
  assert.equal(slugify("Varkala Cliff"), slugify("Varkala-Cliff"));
  assert.equal(result.rows[0].status, "NEW");
  assert.equal(result.rows[1].status, "SLUG_CONFLICT");
});

test("irrelevant Price data produces a warning", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, pricing_type: "Free", price: "500" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "WARNING");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Price is ignored")));
});

test("irrelevant Drone Permission data produces a warning", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, drone_status: "Prohibited", drone_permission: "Forest office" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "WARNING");
  assert.ok(result.rows[0].problems.some((p) => p.message.includes("Drone Permission is ignored")));
});

test("new city is reported as a note without failing the row", () => {
  const result = validateBulkImportRows(
    [makeRow(2, { ...VALID_OVERRIDES, city_name: "Munnar" })],
    makeReference(),
  );
  assert.equal(result.rows[0].status, "NEW");
  assert.ok(result.rows[0].notes.some((n) => n.includes("will be created")));
});

test("country/state selection validation", () => {
  assert.deepEqual(checkCountryStateSelection(null, { country_id: "x" }), {
    ok: false,
    error: "Selected country could not be found.",
  });
  assert.deepEqual(checkCountryStateSelection({ id: "c1" }, null), {
    ok: false,
    error: "Selected state could not be found.",
  });
  assert.deepEqual(checkCountryStateSelection({ id: "c1" }, { country_id: "c2" }), {
    ok: false,
    error: "Selected state does not belong to the selected country.",
  });
  assert.deepEqual(checkCountryStateSelection({ id: "c1" }, { country_id: "c1" }), { ok: true });
});

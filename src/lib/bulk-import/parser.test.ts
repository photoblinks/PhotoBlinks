import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { BULK_IMPORT_COLUMNS, BULK_IMPORT_VERSION } from "./schema";
import { BULK_IMPORT_MAX_ROWS, BULK_IMPORT_MAX_SHEET_ROWS } from "./limits";
import { generateBulkImportTemplate } from "./template";
import { parseBulkImportWorkbook } from "./parser";

const EXPECTED_LABELS = BULK_IMPORT_COLUMNS.map((column) => column.label);

async function buildWorkbook(headers: string[], dataRows: string[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Locations");
  sheet.addRow(headers);
  for (const row of dataRows) sheet.addRow(row);
  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

test("official template parses with zero rows", async () => {
  const bytes = await generateBulkImportTemplate({
    countryName: "India",
    stateName: "Kerala",
    categories: ["Beach", "Temple"],
  });
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.rows.length, 0);
    assert.equal(result.templateVersion, BULK_IMPORT_VERSION);
  }
});

test("valid workbook with rows parses", async () => {
  const bytes = await buildWorkbook(EXPECTED_LABELS, [
    ["Varkala Cliff", "Varkala Cliff", "Kochi", "Beach", "desc", "Free"],
  ]);
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].values.name, "Varkala Cliff");
    assert.equal(result.rows[0].values.pricing_type, "Free");
  }
});

test("missing required column is rejected", async () => {
  const bytes = await buildWorkbook(
    EXPECTED_LABELS.filter((label) => label !== "Card Place Name"),
    [],
  );
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /missing required column 'Card Place Name'/);
});

test("duplicate header is rejected", async () => {
  const bytes = await buildWorkbook(
    EXPECTED_LABELS.map((label, index) => (index === 5 ? "Location Name" : label)),
    [],
  );
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /duplicate column 'Location Name'/);
});

test("unexpected column is rejected", async () => {
  const bytes = await buildWorkbook([...EXPECTED_LABELS, "Notes"], []);
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /unexpected column 'Notes'/);
});

test("out-of-order columns are rejected", async () => {
  const shuffled = [EXPECTED_LABELS[1], EXPECTED_LABELS[0], ...EXPECTED_LABELS.slice(2)];
  const bytes = await buildWorkbook(shuffled, []);
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /out of order/);
});

test("malformed workbook is rejected", async () => {
  const result = await parseBulkImportWorkbook(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Invalid or unsupported Excel file/);
});

test("excessive sheet rows are rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Locations");
  sheet.addRow(EXPECTED_LABELS);
  sheet.getCell(`A${BULK_IMPORT_MAX_SHEET_ROWS + 10}`).value = "x";
  const bytes = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /too many rows/);
});

test("more than MAX_ROWS populated rows are rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Locations");
  sheet.addRow(EXPECTED_LABELS);
  for (let i = 0; i <= BULK_IMPORT_MAX_ROWS; i++) {
    sheet.addRow([`Location ${i}`, "Card", "City", "Beach", "", "Free"]);
  }
  const bytes = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, new RegExp(`more than ${BULK_IMPORT_MAX_ROWS} populated rows`));
});

test("template version drift produces a warning", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Locations").addRow(EXPECTED_LABELS);
  const instructions = workbook.addWorksheet("Instructions");
  instructions.getCell("A2").value = "Template version 9.9 · Generated 2026-01-01";
  const bytes = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  const result = await parseBulkImportWorkbook(bytes);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.templateVersion, "9.9");
    assert.ok(result.workbookWarnings.some((warning) => warning.includes("template version")));
  }
});

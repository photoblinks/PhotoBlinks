import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseBulkImportSheet } from "./parser";
import { generatePhotographerImportTemplate } from "./photographers-template";
import {
  createDraftPhotographers,
  PHOTOGRAPHER_COLUMNS,
  PHOTOGRAPHER_SHEET_CONFIG,
  validatePhotographerRows,
  type PhotographerReference,
} from "./photographers";

const reference: PhotographerReference = {
  countryId: "c1",
  stateId: "s1",
  existingIdentityKeys: new Set(),
  existingPhoneKeys: new Set(["9845000001"]),
};

async function workbookWith(rows: Record<string, string>[]): Promise<Uint8Array> {
  const template = await generatePhotographerImportTemplate({ countryName: "India", stateName: "Kerala" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Photographers")!;
  rows.forEach((row, i) => {
    PHOTOGRAPHER_COLUMNS.forEach((column, c) => {
      sheet.getCell(2 + i, c + 1).value = row[column.key] ?? "";
    });
  });
  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

const base = {
  display_name: "Asha",
  studio_name: "Asha Clicks",
  city: "Kochi",
  phone_number: "98450 00002",
  whatsapp_number: "9845000002",
};

test("template round-trips and validates photographer rows", async () => {
  const bytes = await workbookWith([
    { ...base, services: "candid photography, Drone shots", offers_wedding: "Yes" },
    { ...base, studio_name: "Other", phone_number: "9845000001" },
    { ...base, studio_name: "Bad", phone_number: "9845000003", youtube_url: "https://example.com/x", languages: "Klingon" },
  ]);
  const parsed = await parseBulkImportSheet(bytes, PHOTOGRAPHER_SHEET_CONFIG);
  assert.ok(parsed.ok);
  const { result, fieldsByRow } = validatePhotographerRows(parsed.rows, reference);
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ["NEW", "EXISTING_LOCATION", "INVALID"],
  );
  assert.deepEqual(fieldsByRow.get(2)?.services, ["Candid photography", "Drone shots"]);

  const inserted: Record<string, unknown>[][] = [];
  const outcome = await createDraftPhotographers({
    db: {
      async insertProfiles(rows) {
        inserted.push(rows);
        return { data: rows.map((r, i) => ({ id: `id${i}`, phone_number: String(r.phone_number) })) };
      },
    },
    validatedRows: result.rows,
    fieldsByRow,
    reference,
  });
  assert.equal(outcome.created.length, 1);
  assert.equal(outcome.skipped.length, 1);
  assert.equal(outcome.failed.length, 1);
  assert.equal("user_id" in inserted[0][0], false);
  assert.equal("is_active" in inserted[0][0], false);
});

import ExcelJS from "exceljs";
import { BULK_IMPORT_DATA_START_ROW, BULK_IMPORT_HEADER_ROW } from "./schema";
import { colLetter } from "./template";
import {
  PHOTOGRAPHER_COLUMNS,
  PHOTOGRAPHER_IMPORT_VERSION,
  PHOTOGRAPHER_SHEET_CONFIG,
} from "./photographers";

const MAX_DATA_ROWS = 500;
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Generates the official photographer import workbook (.xlsx bytes). Built
 * from PHOTOGRAPHER_COLUMNS so headers can never drift from the parser. */
export async function generatePhotographerImportTemplate(input: {
  countryName: string;
  stateName: string;
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PhotoBlinks";
  workbook.created = new Date();

  const info = workbook.addWorksheet("Instructions");
  info.getColumn(1).width = 120;
  info.getCell(1, 1).value = "Bulk Photographer Import — Official Template";
  info.getCell(1, 1).font = { bold: true, size: 14 };
  info.getCell(2, 1).value = `Template version ${PHOTOGRAPHER_IMPORT_VERSION} · Generated ${new Date().toISOString().slice(0, 10)}`;
  const lines = [
    "",
    `Country: ${input.countryName}`,
    `State: ${input.stateName}`,
    "The Country and State selected on the Bulk Import page apply to every row. Do NOT add Country or State columns.",
    "",
    `Add one photographer per row on the '${PHOTOGRAPHER_SHEET_CONFIG.sheetName}' sheet, starting at row 2. Do not edit, rename or reorder the header row.`,
    "Required columns have a dark blue header; optional columns have a medium blue header.",
    "Imported profiles are created as drafts (on hold) and unclaimed. Nothing is public until an admin activates them.",
    "Each phone number can belong to only one photographer.",
    "",
    "Column notes:",
    ...PHOTOGRAPHER_COLUMNS.map(
      (c) => `${c.label} — ${c.required ? "required" : "optional"}${c.note ? `. ${c.note}` : ""}`,
    ),
  ];
  lines.forEach((text, i) => {
    info.getCell(3 + i, 1).value = text;
  });

  const sheet = workbook.addWorksheet(PHOTOGRAPHER_SHEET_CONFIG.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = PHOTOGRAPHER_COLUMNS.map((c) => ({ key: c.key, header: c.label, width: c.width }));

  const lastDataRow = BULK_IMPORT_DATA_START_ROW + MAX_DATA_ROWS - 1;
  PHOTOGRAPHER_COLUMNS.forEach((column, index) => {
    const cell = sheet.getRow(BULK_IMPORT_HEADER_ROW).getCell(index + 1);
    cell.fill = solid(column.required ? "FF1F4E79" : "FF4472C4");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    if (column.note) cell.note = column.note;

    const letter = colLetter(index + 1);
    if (column.options) {
      for (let r = BULK_IMPORT_DATA_START_ROW; r <= lastDataRow; r++) {
        sheet.getCell(`${letter}${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${column.options.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Invalid value",
          error: `Pick a value from the ${column.label} dropdown.`,
        };
      }
    }
    if (column.key === "bio") {
      for (let r = BULK_IMPORT_DATA_START_ROW; r <= lastDataRow; r++) {
        sheet.getCell(r, index + 1).alignment = { wrapText: true, vertical: "top" };
      }
    }
  });
  sheet.getRow(BULK_IMPORT_HEADER_ROW).height = 32;

  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

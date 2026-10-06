import ExcelJS from "exceljs";
import {
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_DATA_START_ROW,
  BULK_IMPORT_HEADER_ROW,
  BULK_IMPORT_VERSION,
} from "./schema";
import {
  BULK_IMPORT_MAX_ROWS,
  BULK_IMPORT_MAX_SHEET_ROWS,
} from "./limits";
import type { ParsedRow, WorkbookParseResult } from "./types";

const EXPECTED_LABELS = BULK_IMPORT_COLUMNS.map((column) => column.label);

const LOCATIONS_SHEET = "Locations";
const INSTRUCTIONS_SHEET = "Instructions";

/**
 * Converts an exceljs cell value to its trimmed text, without ever executing
 * formulas: a formula cell contributes only its cached `result` (if it has a
 * usable one). Handles the cell shapes exceljs can surface — plain
 * string/number/boolean/date, formulas, rich-text runs, and hyperlinks.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;

    if ("formula" in object) {
      const result = object.result;
      if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
        return cellText(result);
      }
      return "";
    }

    if ("richText" in object && Array.isArray(object.richText)) {
      return (object.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }

    if ("text" in object && typeof object.text === "string") {
      return object.text.trim();
    }
  }

  return "";
}

/** Extracts the template version from the Instructions sheet's generated-at
 * line ("Template version 1.0 · Generated …"), when present. */
function readTemplateVersion(workbook: ExcelJS.Workbook): string | null {
  const sheet = workbook.getWorksheet(INSTRUCTIONS_SHEET);
  if (!sheet) return null;
  const text = cellText(sheet.getCell("A2").value);
  const match = text.match(/Template version\s+([0-9.]+)/i);
  return match ? match[1] : null;
}

/**
 * Parses an uploaded workbook into raw rows, enforcing the locked template
 * structure. Fails closed on any structural mismatch — arbitrary spreadsheets
 * are never silently reinterpreted as the official template.
 */
export async function parseBulkImportWorkbook(bytes: Uint8Array): Promise<WorkbookParseResult> {
  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    // exceljs types `load` against its own global `Buffer`; at runtime the
    // Uint8Array (a Node Buffer) is exactly what JSZip expects.
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      error: "Invalid or unsupported Excel file. Upload the official .xlsx template.",
    };
  }

  const sheet = workbook.getWorksheet(LOCATIONS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      error: `Invalid template: the '${LOCATIONS_SHEET}' sheet is missing.`,
    };
  }

  if (sheet.rowCount > BULK_IMPORT_MAX_SHEET_ROWS) {
    return {
      ok: false,
      error: `The '${LOCATIONS_SHEET}' sheet has too many rows (maximum ${BULK_IMPORT_MAX_SHEET_ROWS}).`,
    };
  }

  // --- Header validation -------------------------------------------------
  const headerRow = sheet.getRow(BULK_IMPORT_HEADER_ROW);
  const headers: { column: number; label: string }[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, column) => {
    const label = cellText(cell.value);
    if (label !== "") headers.push({ column, label });
  });

  const labels = headers.map((header) => header.label);
  const issues: string[] = [];

  const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
  if (duplicates.length > 0) {
    issues.push(`duplicate column '${duplicates[0]}'.`);
  }

  const missing = EXPECTED_LABELS.filter((label) => !labels.includes(label));
  if (missing.length > 0) {
    issues.push(`missing required column '${missing[0]}'.`);
  }

  const unexpected = labels.filter((label) => !EXPECTED_LABELS.includes(label));
  if (unexpected.length > 0) {
    issues.push(`unexpected column '${unexpected[0]}'.`);
  }

  if (issues.length === 0 && labels.join("|") !== EXPECTED_LABELS.join("|")) {
    issues.push(
      `columns are out of order — expected: ${EXPECTED_LABELS.join(", ")}.`,
    );
  }

  if (issues.length > 0) {
    return { ok: false, error: `Invalid template: ${issues.join(" ")}` };
  }

  // --- Data rows ---------------------------------------------------------
  const rows: ParsedRow[] = [];
  let populatedCount = 0;

  for (let rowNumber = BULK_IMPORT_DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = {} as ParsedRow["values"];
    let hasValue = false;

    BULK_IMPORT_COLUMNS.forEach((column, index) => {
      const text = cellText(row.getCell(index + 1).value);
      if (text !== "") hasValue = true;
      values[column.key] = text;
    });

    if (!hasValue) continue;

    populatedCount += 1;
    if (populatedCount > BULK_IMPORT_MAX_ROWS) {
      return {
        ok: false,
        error: `The workbook has more than ${BULK_IMPORT_MAX_ROWS} populated rows.`,
      };
    }

    rows.push({ excelRow: rowNumber, values });
  }

  const templateVersion = readTemplateVersion(workbook);
  const workbookWarnings: string[] = [];
  if (templateVersion !== null && templateVersion !== BULK_IMPORT_VERSION) {
    workbookWarnings.push(
      `The workbook was generated with template version ${templateVersion}; the current version is ${BULK_IMPORT_VERSION}.`,
    );
  }

  return { ok: true, rows, templateVersion, workbookWarnings };
}

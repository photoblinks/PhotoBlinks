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

const LOCATIONS_SHEET = "Locations";
const INSTRUCTIONS_SHEET = "Instructions";

/** Describes one importable sheet: the locations import and the photographers
 * import share the same hardened parser and differ only by this config. */
export type BulkImportSheetConfig = {
  sheetName: string;
  columns: readonly { key: string; label: string }[];
  version: string;
};

export type ParsedSheetRow = { excelRow: number; values: Record<string, string> };

export type SheetParseResult =
  | { ok: true; rows: ParsedSheetRow[]; templateVersion: string | null; workbookWarnings: string[] }
  | { ok: false; error: string };

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
export async function parseBulkImportSheet(
  bytes: Uint8Array,
  config: BulkImportSheetConfig,
): Promise<SheetParseResult> {
  const { sheetName, columns, version } = config;
  const expectedLabels = columns.map((column) => column.label);
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

  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return {
      ok: false,
      error: `Invalid template: the '${sheetName}' sheet is missing.`,
    };
  }

  if (sheet.rowCount > BULK_IMPORT_MAX_SHEET_ROWS) {
    return {
      ok: false,
      error: `The '${sheetName}' sheet has too many rows (maximum ${BULK_IMPORT_MAX_SHEET_ROWS}).`,
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

  const missing = expectedLabels.filter((label) => !labels.includes(label));
  if (missing.length > 0) {
    issues.push(`missing required column '${missing[0]}'.`);
  }

  const unexpected = labels.filter((label) => !expectedLabels.includes(label));
  if (unexpected.length > 0) {
    issues.push(`unexpected column '${unexpected[0]}'.`);
  }

  if (issues.length === 0 && labels.join("|") !== expectedLabels.join("|")) {
    issues.push(
      `columns are out of order — expected: ${expectedLabels.join(", ")}.`,
    );
  }

  if (issues.length > 0) {
    return { ok: false, error: `Invalid template: ${issues.join(" ")}` };
  }

  // --- Data rows ---------------------------------------------------------
  const rows: ParsedSheetRow[] = [];
  let populatedCount = 0;

  for (let rowNumber = BULK_IMPORT_DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values: Record<string, string> = {};
    let hasValue = false;

    columns.forEach((column, index) => {
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
  if (templateVersion !== null && templateVersion !== version) {
    workbookWarnings.push(
      `The workbook was generated with template version ${templateVersion}; the current version is ${version}.`,
    );
  }

  return { ok: true, rows, templateVersion, workbookWarnings };
}

export async function parseBulkImportWorkbook(bytes: Uint8Array): Promise<WorkbookParseResult> {
  const result = await parseBulkImportSheet(bytes, {
    sheetName: LOCATIONS_SHEET,
    columns: BULK_IMPORT_COLUMNS,
    version: BULK_IMPORT_VERSION,
  });
  return result.ok ? { ...result, rows: result.rows as ParsedRow[] } : result;
}

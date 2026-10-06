import type { BULK_IMPORT_COLUMNS } from "./schema";

/** Stable column key — the exact DB field code from the shared Phase 2
 * schema. */
export type BulkImportColumnKey = (typeof BULK_IMPORT_COLUMNS)[number]["key"];

/** One parsed (raw) data row from the Locations sheet. Values are the
 * trimmed cell text keyed by column key; blank cells are `""`. */
export type ParsedRow = {
  /** 1-based row number in the Excel sheet (>= BULK_IMPORT_DATA_START_ROW). */
  excelRow: number;
  values: Record<BulkImportColumnKey, string>;
};

export type RowProblemKind = "error" | "warning";

export type RowProblem = {
  /** Column label the problem refers to, when applicable. */
  field?: string;
  message: string;
  kind: RowProblemKind;
};

export type RowStatus =
  | "NEW"
  | "WARNING"
  | "INVALID"
  | "DUPLICATE_IN_FILE"
  | "EXISTING_LOCATION"
  | "SLUG_CONFLICT";

export type ValidatedRow = {
  /** 1-based Excel row number. */
  excelRow: number;
  /** Display location name (may be null when the Name cell is blank). */
  name: string | null;
  /** Display city (may be null when the City cell is blank). */
  city: string | null;
  status: RowStatus;
  problems: RowProblem[];
  /** Informational notes (e.g. "city will be created during import"). */
  notes: string[];
  /** The slug the import would generate for this row (null when no name). */
  slug: string | null;
};

export type ValidationSummary = {
  totalRows: number;
  /** Rows with status NEW (valid, no problems). */
  validRows: number;
  /** Rows with status WARNING (valid but with warnings). */
  warningRows: number;
  /** Rows with status INVALID (have errors). */
  errorRows: number;
  /** Rows with status DUPLICATE_IN_FILE, EXISTING_LOCATION, or SLUG_CONFLICT. */
  duplicateRows: number;
};

export type BulkImportValidationResult = {
  summary: ValidationSummary;
  rows: ValidatedRow[];
  /** Non-fatal workbook-level notices (e.g. template version drift). */
  workbookWarnings: string[];
  /** Template version read from the Instructions sheet, if present. */
  templateVersion: string | null;
};

/** Outcome of loading + structurally validating the uploaded workbook. */
export type WorkbookParseResult =
  | {
      ok: true;
      rows: ParsedRow[];
      templateVersion: string | null;
      workbookWarnings: string[];
    }
  | { ok: false; error: string };

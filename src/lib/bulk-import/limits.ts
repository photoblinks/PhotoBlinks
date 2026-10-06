/**
 * Documented safety limits for Bulk Location Excel Import (Phase 3).
 *
 * These are the single source of truth for every bound applied while parsing
 * and validating an uploaded workbook, so the limits are consistent across
 * the parser, the route handler, and the tests rather than scattered as
 * arbitrary magic numbers.
 */

/** Maximum accepted upload size (4 MB). Well below Vercel's ~4.5 MB
 * serverless request-body cap, and far larger than any realistic import
 * (thousands of rows of text). */
export const BULK_IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Maximum number of populated data rows (rows with at least one non-empty
 * cell) that a single upload may contain. */
export const BULK_IMPORT_MAX_ROWS = 2000;

/** Maximum total rows the Locations sheet may declare (header + data rows +
 * the template's pre-formatted empty dropdown rows). Anything larger is
 * rejected before iteration so a hostile sparse sheet (e.g. a value at row
 * 1,000,000) cannot force millions of cell reads. */
export const BULK_IMPORT_MAX_SHEET_ROWS = 2500;

/** Maximum length (characters) of a single cell value. Longer values are
 * reported as errors; this bounds the size of any one parsed field. */
export const BULK_IMPORT_MAX_CELL_LENGTH = 10_000;

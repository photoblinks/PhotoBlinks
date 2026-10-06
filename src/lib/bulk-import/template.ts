import ExcelJS from "exceljs";
import {
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_DATA_START_ROW,
  BULK_IMPORT_ENUMS,
  BULK_IMPORT_HEADER_ROW,
  BULK_IMPORT_VERSION,
} from "./schema";

/** Number of empty data rows the workbook pre-configures with dropdowns and
 * text wrapping. Phase 3's parser is not limited by this — it reads every
 * populated row regardless of this convenience range. */
const MAX_DATA_ROWS = 500;

/** Hidden helper column (one past the 28 approved columns) that holds the
 * active category names so the Category dropdown can reference them. Excel
 * data-validation lists cannot reference another sheet without a defined
 * name, so the list lives on the Locations sheet itself, out of sight. */
const CATEGORY_HELPER_COLUMN_INDEX = BULK_IMPORT_COLUMNS.length + 1;

const REQUIRED_HEADER_FILL = "FF1F4E79";
const OPTIONAL_HEADER_FILL = "FF4472C4";
const HEADER_TEXT_COLOR = "FFFFFFFF";
const SECTION_FILL = "FFD9E2F3";
const BORDER_COLOR = "FFBFBFBF";

function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function sectionRow(sheet: ExcelJS.Worksheet, rowIndex: number, label: string) {
  const cell = sheet.getCell(rowIndex, 1);
  cell.value = label;
  cell.font = { bold: true, color: { argb: "FF1F3864" } };
  cell.fill = fill(SECTION_FILL);
}

function titleCell(sheet: ExcelJS.Worksheet, rowIndex: number, text: string) {
  const cell = sheet.getCell(rowIndex, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14 };
}

/** Human-friendly short date for the generated-at line. */
function generatedAt(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildInstructionsSheet(
  workbook: ExcelJS.Workbook,
  countryName: string,
  stateName: string,
) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.getColumn(1).width = 120;
  sheet.getColumn(2).width = 60;

  const requiredLabels = BULK_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.label);
  const conditionalColumns = BULK_IMPORT_COLUMNS.filter((c) => c.condition);
  const dropdownLabels = BULK_IMPORT_COLUMNS.filter(
    (c) => c.type === "enum" || c.type === "category",
  ).map((c) => c.label);

  let row = 1;
  titleCell(sheet, row++, "Bulk Location Import — Official Template");
  sheet.getCell(row++, 1).value = `Template version ${BULK_IMPORT_VERSION} · Generated ${generatedAt()}`;
  row++;

  sectionRow(sheet, row++, "Country & State");
  sheet.getCell(row++, 1).value = `Country: ${countryName}`;
  sheet.getCell(row++, 1).value = `State: ${stateName}`;
  sheet.getCell(row++, 1).value =
    "The Country and State selected on the Bulk Import page apply to every row you add. " +
    "Do NOT add Country or State columns to the Locations sheet.";
  row++;

  sectionRow(sheet, row++, "How to fill the Locations sheet");
  sheet.getCell(row++, 1).value = "1. Open the Locations sheet and add one location per row, starting at row 2.";
  sheet.getCell(row++, 1).value = "2. Do not edit, rename, or reorder the header row — the importer matches columns by name.";
  sheet.getCell(row++, 1).value =
    "3. Use the dropdowns for Category, Pricing, Pre-Wedding Shoot, Drone Status, Vehicle Parking Availability, Changing Facilities, Restrooms, Access Level, and Crowd Level.";
  sheet.getCell(row++, 1).value =
    "4. Required columns have a dark blue header; optional columns have a medium blue header.";
  sheet.getCell(row++, 1).value = "5. Leave blank rows empty — do not add notes, totals, or extra sheets.";
  sheet.getCell(row++, 1).value =
    "6. When finished, return to the Bulk Import page, choose the file, and click Validate.";
  row++;

  sectionRow(sheet, row++, "Required fields");
  sheet.getCell(row++, 1).value =
    `${requiredLabels.join(", ")}. Price is required when Pricing = Paid.`;
  row++;

  sectionRow(sheet, row++, "Conditional fields");
  for (const col of conditionalColumns) {
    const dependsOn = BULK_IMPORT_COLUMNS.find((c) => c.key === col.condition?.dependsOn);
    sheet.getCell(row++, 1).value =
      `${col.label}: ${col.condition?.note} (depends on ${dependsOn?.label ?? col.condition?.dependsOn})`;
  }
  row++;

  sectionRow(sheet, row++, "Dropdown fields");
  sheet.getCell(row++, 1).value = dropdownLabels.join(", ");
  row++;

  sectionRow(sheet, row++, "Example (reference only — do not paste into the Locations sheet)");
  const example = [
    "Location Name: Athirappilly Falls Viewpoint",
    "Card Place Name: Athirappilly Viewpoint",
    "City: Chalakudy",
    "Category: Waterfall",
    "Description: Riverside viewpoint with a clear view of the falls. Multi-line text is fine.",
    "Pricing: Paid",
    "Price: 500",
    "Pre-Wedding Shoot: Allowed",
    "Drone Status: Allowed with Permission",
    "Drone Permission: Forest department office at the entry gate",
    "Vehicle Parking Availability: Available",
    "Changing Facilities: Available",
    "Best Season: September–January",
  ];
  for (const line of example) {
    sheet.getCell(row++, 1).value = line;
  }
}

function buildReferenceSheet(
  workbook: ExcelJS.Workbook,
  countryName: string,
  stateName: string,
  categories: readonly string[],
) {
  const sheet = workbook.addWorksheet("Reference Data");
  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 70;

  let row = 1;
  titleCell(sheet, row++, "Bulk Import Reference Data");
  sheet.getCell(row++, 1).value = `Template version ${BULK_IMPORT_VERSION}`;
  row++;

  sectionRow(sheet, row++, "Selected context");
  sheet.getCell(row, 1).value = "Country";
  sheet.getCell(row++, 2).value = countryName;
  sheet.getCell(row, 1).value = "State";
  sheet.getCell(row++, 2).value = stateName;
  sheet.getCell(row++, 1).value = "These apply to every row on the Locations sheet.";
  row++;

  sectionRow(sheet, row++, "Controlled dropdown values");
  const enumRows: Array<[string, string]> = [
    ["Pricing", "Free | Paid | Unknown"],
    ["Pre-Wedding Shoot", "Allowed | Conditional | Prohibited"],
    ["Drone Status", "Allowed | Allowed with Permission | Restricted | Prohibited"],
    ["Vehicle Parking Availability", "Available | Limited | Not Available"],
    ["Changing Facilities", "Available | Limited | Not Available"],
    ["Restrooms", "Available | Limited | Not Available"],
    ["Access Level", "Easy | Very Easy | Moderate | Very Difficult"],
    ["Crowd Level", "Low | Moderate | High | Very High"],
  ];
  for (const [label, values] of enumRows) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row++, 2).value = values;
  }
  row++;

  sectionRow(sheet, row++, "Categories (active)");
  for (const category of categories) {
    sheet.getCell(row++, 1).value = category;
  }
  row++;

  sectionRow(sheet, row++, "Column reference");
  sheet.getCell(row, 1).value = "Field";
  sheet.getCell(row, 2).value = "Required";
  sheet.getCell(row, 3).value = "Notes";
  sheet.getRow(row).font = { bold: true };
  row++;
  for (const col of BULK_IMPORT_COLUMNS) {
    sheet.getCell(row, 1).value = col.label;
    sheet.getCell(row, 2).value = col.required ? "Yes" : "No";
    const notes = [
      col.condition?.note,
      col.type === "enum" || col.type === "category" ? "Use dropdown" : undefined,
      col.note,
    ]
      .filter(Boolean)
      .join(" ");
    sheet.getCell(row, 3).value = notes;
    row++;
  }
  sheet.getColumn(3).width = 80;
}

function buildLocationsSheet(
  workbook: ExcelJS.Workbook,
  categories: readonly string[],
) {
  const sheet = workbook.addWorksheet("Locations", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = BULK_IMPORT_COLUMNS.map((col) => ({
    key: col.key,
    header: col.label,
    width: col.width,
  }));

  const headerRow = sheet.getRow(BULK_IMPORT_HEADER_ROW);
  BULK_IMPORT_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.fill = fill(col.required ? REQUIRED_HEADER_FILL : OPTIONAL_HEADER_FILL);
    cell.font = { bold: true, color: { argb: HEADER_TEXT_COLOR } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };
    if (col.required) cell.note = "Required";
    if (col.condition) cell.note = col.condition.note;
  });
  headerRow.height = 32;

  // Hide the helper column that feeds the Category dropdown, then fill it
  // with the current active category names.
  const helperLetter = colLetter(CATEGORY_HELPER_COLUMN_INDEX);
  categories.forEach((name, i) => {
    sheet.getCell(`${helperLetter}${BULK_IMPORT_DATA_START_ROW + i}`).value = name;
  });
  sheet.getColumn(CATEGORY_HELPER_COLUMN_INDEX).hidden = true;

  const lastDataRow = BULK_IMPORT_DATA_START_ROW + MAX_DATA_ROWS - 1;

  BULK_IMPORT_COLUMNS.forEach((col, idx) => {
    const letter = colLetter(idx + 1);
    const colIndex = idx + 1;

    if (col.type === "enum" && col.enumKey) {
      const options = BULK_IMPORT_ENUMS[col.enumKey];
      const list = options.map((o) => o.label).join(",");
      for (let r = BULK_IMPORT_DATA_START_ROW; r <= lastDataRow; r++) {
        sheet.getCell(`${letter}${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${list}"`],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Invalid value",
          error: `Pick a value from the ${col.label} dropdown.`,
        };
      }
    } else if (col.type === "category") {
      const helperRange =
        `$${helperLetter}$${BULK_IMPORT_DATA_START_ROW}:` +
        `$${helperLetter}$${BULK_IMPORT_DATA_START_ROW + categories.length - 1}`;
      for (let r = BULK_IMPORT_DATA_START_ROW; r <= lastDataRow; r++) {
        sheet.getCell(`${letter}${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [helperRange],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Invalid category",
          error: "Pick a category from the dropdown.",
        };
      }
    } else if (col.type === "multiline") {
      for (let r = BULK_IMPORT_DATA_START_ROW; r <= lastDataRow; r++) {
        sheet.getCell(r, colIndex).alignment = { wrapText: true, vertical: "top" };
      }
    }
  });
}

export type BulkImportTemplateInput = {
  countryName: string;
  stateName: string;
  categories: readonly string[];
};

/** Generates the official bulk-import workbook as an .xlsx byte array. The
 * workbook is built entirely from the shared schema (BULK_IMPORT_COLUMNS),
 * so the header order/names and dropdown rules can never drift from what
 * Phase 3's parser expects. */
export async function generateBulkImportTemplate(
  input: BulkImportTemplateInput,
): Promise<Uint8Array> {
  const { countryName, stateName, categories } = input;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PhotoBlinks";
  workbook.created = new Date();
  workbook.modified = new Date();

  buildInstructionsSheet(workbook, countryName, stateName);
  buildLocationsSheet(workbook, categories);
  buildReferenceSheet(workbook, countryName, stateName, categories);

  // exceljs types `writeBuffer()` as returning a global `Buffer` that clashes
  // with Node's Buffer; at runtime it is a plain Node Buffer (a Uint8Array).
  return (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
}

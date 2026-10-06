import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { parseBulkImportWorkbook } from "@/lib/bulk-import/parser";
import { validateBulkImportRows } from "@/lib/bulk-import/validate";
import { loadBulkImportReference } from "@/lib/bulk-import/reference";
import { BULK_IMPORT_MAX_FILE_BYTES } from "@/lib/bulk-import/limits";

const ALLOWED_EXTENSION = ".xlsx";

export async function POST(request: Request) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Same permission as the manual location form: bulk import creates drafts.
  if (!staff.can(PERMISSION.LOCATIONS_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an Excel file." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const countryId = String(formData.get("countryId") ?? "");
  const stateId = String(formData.get("stateId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an Excel file to validate." }, { status: 400 });
  }
  if (!countryId || !stateId) {
    return NextResponse.json(
      { error: "Country and state are required." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > BULK_IMPORT_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `The file is too large. Maximum size is ${BULK_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB.` },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
    return NextResponse.json(
      { error: "Only .xlsx files are supported." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Parse + structural template validation (hostile-input hardened).
  const parsed = await parseBulkImportWorkbook(bytes);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createClient();
  const loaded = await loadBulkImportReference(supabase, countryId, stateId, parsed.rows);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 400 });
  }

  const result = validateBulkImportRows(parsed.rows, loaded.reference);

  return NextResponse.json({
    ...result,
    workbookWarnings: parsed.workbookWarnings,
    templateVersion: parsed.templateVersion,
  });
}

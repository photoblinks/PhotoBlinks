import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { parseBulkImportSheet } from "@/lib/bulk-import/parser";
import {
  loadPhotographerReference,
  PHOTOGRAPHER_SHEET_CONFIG,
  validatePhotographerRows,
} from "@/lib/bulk-import/photographers";
import { readBulkUpload } from "@/lib/bulk-import/upload";

export async function POST(request: Request) {
  if (!(await getAuthorizedAdminUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upload = await readBulkUpload(request);
  if ("response" in upload) return upload.response;

  const parsed = await parseBulkImportSheet(upload.bytes, PHOTOGRAPHER_SHEET_CONFIG);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const loaded = await loadPhotographerReference(
    supabase,
    String(upload.formData.get("countryId")),
    String(upload.formData.get("stateId")),
  );
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 400 });

  const { result } = validatePhotographerRows(parsed.rows, loaded.reference);
  return NextResponse.json({
    ...result,
    workbookWarnings: parsed.workbookWarnings,
    templateVersion: parsed.templateVersion,
  });
}

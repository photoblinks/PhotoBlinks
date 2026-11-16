import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordActivityEventsFor } from "@/lib/activity";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { parseBulkImportSheet } from "@/lib/bulk-import/parser";
import {
  createDraftPhotographers,
  loadPhotographerReference,
  PHOTOGRAPHER_SHEET_CONFIG,
  validatePhotographerRows,
  type PhotographerCreateDb,
} from "@/lib/bulk-import/photographers";
import { readBulkUpload } from "@/lib/bulk-import/upload";

/** Creates DRAFT (inactive, unclaimed) photographer profiles. The browser's
 * validation preview is not trusted: the workbook is re-uploaded, re-parsed
 * and re-validated here, and country/state are re-verified server-side. Runs
 * through the request-scoped client so the admin RLS policy still applies. */
export async function POST(request: Request) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!staff.can(PERMISSION.PHOTOGRAPHERS_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const { result, fieldsByRow } = validatePhotographerRows(parsed.rows, loaded.reference);

  const db: PhotographerCreateDb = {
    async insertProfiles(rows) {
      const { data, error } = await supabase
        .from("photographer_profiles")
        .insert(rows)
        .select("id, phone_number");
      if (error) return { error: { message: error.message, code: error.code } };
      return { data: data ?? [] };
    },
  };

  const outcome = await createDraftPhotographers({
    db,
    validatedRows: result.rows,
    fieldsByRow,
    reference: loaded.reference,
  });

  await recordActivityEventsFor(
    supabase,
    outcome.created.map((photographer) => ({
      module: "photographers" as const,
      action: "created" as const,
      entity_id: photographer.id,
      metadata: { name: photographer.name, source: "bulk_import" },
    })),
  );

  // Drafts are inactive, so nothing public changes until an admin activates
  // them (setPhotographerStatus revalidates the public cache then).
  if (outcome.created.length > 0) {
    revalidatePath("/admin/photographer-profiles");
    revalidatePath("/admin/photographer-requests");
  }

  return NextResponse.json({
    requested: result.summary.totalRows,
    created: outcome.created.map(({ excelRow, name }) => ({ excelRow, name })),
    skipped: outcome.skipped,
    failed: outcome.failed,
  });
}

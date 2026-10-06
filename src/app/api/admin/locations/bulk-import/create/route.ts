import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { recordActivityEventsFor } from "@/lib/activity";
import { parseBulkImportWorkbook } from "@/lib/bulk-import/parser";
import { validateBulkImportRowsDetailed } from "@/lib/bulk-import/validate";
import { loadBulkImportReference } from "@/lib/bulk-import/reference";
import { createDraftLocations, type BulkCreateDb } from "@/lib/bulk-import/create";
import { BULK_IMPORT_MAX_FILE_BYTES } from "@/lib/bulk-import/limits";

const ALLOWED_EXTENSION = ".xlsx";

/** Phase 4: creates DRAFT locations. The browser's Phase 3 preview is not
 * trusted — the workbook is re-uploaded, re-parsed and re-validated here
 * against current database state, and every id (country, state, city,
 * category) is resolved server-side. Runs through the request-scoped RLS
 * client; no service-role shortcut. */
export async function POST(request: Request) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  const acknowledgeWarnings = formData.get("acknowledgeWarnings") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an Excel file to import." }, { status: 400 });
  }
  if (!countryId || !stateId) {
    return NextResponse.json({ error: "Country and state are required." }, { status: 400 });
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
    return NextResponse.json({ error: "Only .xlsx files are supported." }, { status: 400 });
  }

  const parsed = await parseBulkImportWorkbook(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createClient();
  const loaded = await loadBulkImportReference(supabase, countryId, stateId, parsed.rows);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 400 });
  }

  const { result, resolvedByRow } = validateBulkImportRowsDetailed(parsed.rows, loaded.reference);

  if (result.summary.warningRows > 0 && !acknowledgeWarnings) {
    return NextResponse.json(
      { error: "This file has warnings. Review and acknowledge them before creating locations." },
      { status: 400 },
    );
  }

  const db: BulkCreateDb = {
    async findOrCreateCity(cityStateId, name) {
      const { data, error } = (await supabase
        .rpc("find_or_create_city", { p_state_id: cityStateId, p_name: name })
        .single()) as { data: { city_id: string } | null; error: { message: string } | null };
      if (error || !data) return { error: error?.message ?? "Could not resolve the city." };
      return { id: data.city_id };
    },
    async insertLocations(rows) {
      const { data, error } = await supabase.from("locations").insert(rows).select("id, slug");
      if (error) return { error: { message: error.message, code: error.code } };
      return { data: data ?? [] };
    },
  };

  const outcome = await createDraftLocations({
    db,
    rows: parsed.rows,
    validatedRows: result.rows,
    resolvedByRow,
    reference: loaded.reference,
  });

  await recordActivityEventsFor(
    supabase,
    outcome.created.map((location) => ({
      module: "locations" as const,
      action: "created" as const,
      entity_id: location.id,
      metadata: { name: location.name, source: "bulk_import" },
    })),
  );

  if (outcome.created.length > 0) revalidatePath("/admin/locations");

  return NextResponse.json({
    requested: result.summary.totalRows,
    created: outcome.created.map(({ excelRow, name }) => ({ excelRow, name })),
    skipped: outcome.skipped,
    failed: outcome.failed,
  });
}

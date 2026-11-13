import { NextResponse } from "next/server";
import { BULK_IMPORT_MAX_FILE_BYTES } from "./limits";

/** Reads and bounds-checks the multipart upload shared by the photographer
 * validate/create routes. Returns the file bytes plus the raw form fields. */
export async function readBulkUpload(
  request: Request,
): Promise<{ bytes: Uint8Array; formData: FormData } | { response: NextResponse }> {
  const fail = (error: string) => ({ response: NextResponse.json({ error }, { status: 400 }) });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Expected multipart/form-data with an Excel file.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Choose an Excel file.");
  if (!String(formData.get("countryId") ?? "") || !String(formData.get("stateId") ?? "")) {
    return fail("Country and state are required.");
  }
  if (file.size === 0) return fail("The uploaded file is empty.");
  if (file.size > BULK_IMPORT_MAX_FILE_BYTES) {
    return fail(`The file is too large. Maximum size is ${BULK_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) return fail("Only .xlsx files are supported.");

  return { bytes: new Uint8Array(await file.arrayBuffer()), formData };
}

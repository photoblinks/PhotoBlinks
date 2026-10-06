import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStaffUser, PERMISSION } from "@/lib/supabase/require-permission";
import { generateBulkImportTemplate } from "@/lib/bulk-import/template";
import { slugify } from "@/lib/slug";

const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  const staff = await getAuthorizedStaffUser();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Bulk import creates draft locations, so it lives under the same edit
  // permission as the manual location form.
  if (!staff.can(PERMISSION.LOCATIONS_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const countryId = searchParams.get("countryId");
  const stateId = searchParams.get("stateId");

  if (!countryId || !stateId) {
    return NextResponse.json(
      { error: "Country and state are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Server-side validation: both ids must exist and the state must belong to
  // the country. Reference data is loaded here too — never trusted from the
  // client — and categories are restricted to active rows.
  const [{ data: country }, { data: state }, { data: categories }] = await Promise.all([
    supabase.from("countries").select("id, name").eq("id", countryId).maybeSingle(),
    supabase.from("states").select("id, name, country_id").eq("id", stateId).maybeSingle(),
    supabase.from("categories").select("name").eq("is_active", true).order("sort_order"),
  ]);

  if (!country) {
    return NextResponse.json(
      { error: "Selected country could not be found." },
      { status: 400 },
    );
  }
  if (!state) {
    return NextResponse.json(
      { error: "Selected state could not be found." },
      { status: 400 },
    );
  }
  if (state.country_id !== country.id) {
    return NextResponse.json(
      { error: "Selected state does not belong to the selected country." },
      { status: 400 },
    );
  }

  const categoryNames = (categories ?? []).map((category) => category.name);
  if (categoryNames.length === 0) {
    return NextResponse.json(
      { error: "No active categories are available to build the template." },
      { status: 400 },
    );
  }

  const buffer = await generateBulkImportTemplate({
    countryName: country.name,
    stateName: state.name,
    categories: categoryNames,
  });

  const filename =
    `photoblinks-location-import-${slugify(country.name)}-${slugify(state.name)}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": EXCEL_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

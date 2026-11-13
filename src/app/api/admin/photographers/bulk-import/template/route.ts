import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { generatePhotographerImportTemplate } from "@/lib/bulk-import/photographers-template";
import { checkCountryStateSelection } from "@/lib/bulk-import/validate";
import { slugify } from "@/lib/slug";

const EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  if (!(await getAuthorizedAdminUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const countryId = searchParams.get("countryId");
  const stateId = searchParams.get("stateId");
  if (!countryId || !stateId) {
    return NextResponse.json({ error: "Country and state are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: country }, { data: state }] = await Promise.all([
    supabase.from("countries").select("id, name").eq("id", countryId).maybeSingle(),
    supabase.from("states").select("id, name, country_id").eq("id", stateId).maybeSingle(),
  ]);
  const selection = checkCountryStateSelection(country, state);
  if (!selection.ok) return NextResponse.json({ error: selection.error }, { status: 400 });

  const buffer = await generatePhotographerImportTemplate({
    countryName: country!.name,
    stateName: state!.name,
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": EXCEL_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="photoblinks-photographer-import-${slugify(country!.name)}-${slugify(state!.name)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

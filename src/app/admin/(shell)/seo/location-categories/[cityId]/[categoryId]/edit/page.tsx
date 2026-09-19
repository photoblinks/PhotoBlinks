import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { buildCategoryCityDefaultDescription, buildCategoryCityDefaultTitle } from "@/lib/seo-templates";
import { resetLocationCategorySeo, saveLocationCategorySeo } from "../../../actions";

type Props = {
  params: Promise<{ cityId: string; categoryId: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

export default async function EditLocationCategorySeoPage({ params, searchParams }: Props) {
  await requireAdminPage();

  const { cityId, categoryId } = await params;
  const { error, returnTo } = await searchParams;
  const supabase = await createClient();

  const [{ data: city }, { data: category }, { data: seo }] = await Promise.all([
    supabase
      .from("cities")
      .select("name, slug, states(name, slug, countries(name, slug))")
      .eq("id", cityId)
      .single(),
    supabase.from("categories").select("name, slug").eq("id", categoryId).single(),
    supabase
      .from("location_category_seo")
      .select("meta_title, meta_description")
      .eq("city_id", cityId)
      .eq("category_id", categoryId)
      .maybeSingle(),
  ]);

  if (!city || !category) notFound();

  const state = Array.isArray(city.states) ? city.states[0] : city.states;
  const countryRaw = state && (Array.isArray(state.countries) ? state.countries[0] : state.countries);
  if (!state || !countryRaw) notFound();

  const pageUrl = `/locations/${countryRaw.slug}/${state.slug}/${city.slug}/${category.slug}`;
  const defaultTitle = buildCategoryCityDefaultTitle(category.name, city.name);
  const defaultDescription = buildCategoryCityDefaultDescription(category.name, city.name, state.name);
  const backHref = returnTo || "/admin/seo/location-categories";
  const hasOverride = Boolean(seo?.meta_title || seo?.meta_description);

  const save = saveLocationCategorySeo.bind(null, cityId, categoryId, backHref);
  const reset = resetLocationCategorySeo.bind(null, cityId, categoryId, backHref);

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href={backHref} className="text-muted-foreground hover:underline">
          &larr; Back to Location + Category SEO
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold">
        Edit SEO — {category.name} in {city.name}
      </h1>

      <form action={save} className="max-w-lg">
        <FieldGroup>
          {error && <FieldError>{error}</FieldError>}

          <Field>
            <FieldLabel>Public Page</FieldLabel>
            <Link
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-pb-brand hover:underline"
            >
              {pageUrl}
            </Link>
          </Field>

          <Field>
            <FieldLabel htmlFor="meta_title">SEO Title</FieldLabel>
            <Input
              id="meta_title"
              name="meta_title"
              defaultValue={seo?.meta_title ?? ""}
              placeholder={defaultTitle}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="meta_description">Meta Description</FieldLabel>
            <Textarea
              id="meta_description"
              name="meta_description"
              defaultValue={seo?.meta_description ?? ""}
              placeholder={defaultDescription}
              rows={3}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit">Save changes</Button>
            {hasOverride && (
              <Button type="submit" formAction={reset} variant="outline">
                Reset to Default
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}

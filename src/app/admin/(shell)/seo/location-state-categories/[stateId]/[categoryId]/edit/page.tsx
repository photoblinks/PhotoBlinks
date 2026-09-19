import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  buildStateCategoryDefaultDescription,
  buildStateCategoryDefaultTitle,
} from "@/lib/seo-templates";
import { resetLocationStateCategorySeo, saveLocationStateCategorySeo } from "../../../actions";

type Props = {
  params: Promise<{ stateId: string; categoryId: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

export default async function EditLocationStateCategorySeoPage({ params, searchParams }: Props) {
  await requireAdminPage();

  const { stateId, categoryId } = await params;
  const { error, returnTo } = await searchParams;
  const supabase = await createClient();

  const [{ data: state }, { data: category }, { data: seo }] = await Promise.all([
    supabase.from("states").select("name, slug, countries(name, slug)").eq("id", stateId).single(),
    supabase.from("categories").select("name, slug").eq("id", categoryId).single(),
    supabase
      .from("location_state_category_seo")
      .select("meta_title, meta_description")
      .eq("state_id", stateId)
      .eq("category_id", categoryId)
      .maybeSingle(),
  ]);

  if (!state || !category) notFound();

  const countryRaw = Array.isArray(state.countries) ? state.countries[0] : state.countries;
  if (!countryRaw) notFound();

  const pageUrl = `/locations/${countryRaw.slug}/${state.slug}/${category.slug}`;
  const defaultTitle = buildStateCategoryDefaultTitle(category.name, state.name);
  const defaultDescription = buildStateCategoryDefaultDescription(category.name, state.name);
  const backHref = returnTo || "/admin/seo/location-state-categories";
  const hasOverride = Boolean(seo?.meta_title || seo?.meta_description);

  const save = saveLocationStateCategorySeo.bind(null, stateId, categoryId, backHref);
  const reset = resetLocationStateCategorySeo.bind(null, stateId, categoryId, backHref);

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href={backHref} className="text-muted-foreground hover:underline">
          &larr; Back to State + Category SEO
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold">
        Edit SEO — {category.name} in {state.name}
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

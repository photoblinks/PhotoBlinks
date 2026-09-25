import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/supabase/require-permission";
import { parseEditorialBlocks } from "@/lib/blog/content-blocks";
import type { BlogBlockInput } from "@/components/admin/blog-content-editor";
import { EditorialForm } from "../../../editorial-form";

export default async function StateEditorialEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ stateId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const { stateId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: state }, { data: editorial }, { data: locations }] = await Promise.all([
    supabase.from("states").select("id, name, slug").eq("id", stateId).maybeSingle(),
    supabase
      .from("location_editorial")
      .select("id, status, content")
      .eq("state_id", stateId)
      .eq("scope", "state")
      .maybeSingle(),
    supabase
      .from("locations")
      .select("id, name")
      .eq("state_id", stateId)
      .eq("is_published", true)
      .order("name")
      .limit(500),
  ]);

  if (!state) return <p className="text-muted-foreground">State not found.</p>;

  return (
    <div>
      <Link
        href="/admin/editorial"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to editorial
      </Link>
      <EditorialForm
        target={{
          scope: "state",
          stateId: state.id,
          syntheticSlug: `state-${state.slug}`,
          title: `Editorial — ${state.name}`,
        }}
        existing={
          editorial
            ? {
                id: editorial.id,
                status: editorial.status as "draft" | "published",
                content: parseEditorialBlocks(editorial.content) as unknown as BlogBlockInput[],
              }
            : undefined
        }
        locations={locations ?? []}
        error={error}
      />
    </div>
  );
}

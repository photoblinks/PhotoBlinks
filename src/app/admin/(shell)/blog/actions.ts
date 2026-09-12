"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedAdminUser } from "@/lib/supabase/require-admin";
import { slugify } from "@/lib/slug";
import { isAllowedR2ImageUrl } from "@/lib/r2/upload";
import { parseBlogContent } from "@/lib/blog/content-blocks";

const faqSchema = z.object({
  question: z.string().trim().min(1, "FAQ question is required.").max(300, "FAQ question is too long."),
  answer: z.string().trim().min(1, "FAQ answer is required.").max(2000, "FAQ answer is too long."),
});

// Toggle actions receive their next value as a bound action argument (a
// hidden form field / bind argument), so it is re-validated at runtime with
// Zod rather than trusted. The authorization check still runs first — see
// toggleBlogPostStatus / toggleBlogPostFeatured.
const blogPostStatusSchema = z.enum(["draft", "published"]);

const featuredImageUrlSchema = z.union([
  z.literal("").transform(() => undefined),
  z
    .string()
    .trim()
    .url()
    .refine(isAllowedR2ImageUrl, "Image must be hosted on the PhotoBlinks R2 bucket."),
]);

const postSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  slug: z.string().trim().min(1, "Slug is required.").max(200),
  excerpt: z.string().trim().max(500).optional(),
  category_id: z.string().uuid().optional(),
  author_name: z.string().trim().min(1, "Author name is required.").max(150),
  featured_image_url: featuredImageUrlSchema,
  featured_image_alt: z.string().trim().max(300).optional(),
  meta_title: z.string().trim().max(200).optional(),
  meta_description: z.string().trim().max(500).optional(),
  is_featured: z.boolean(),
  faqs: z.array(faqSchema).max(30).default([]),
  tag_ids: z.array(z.string().uuid()).max(30).default([]),
  location_ids: z.array(z.string().uuid()).max(50).default([]),
});

function parseBlogPostForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();

  const contentRaw = String(formData.get("content_json") ?? "[]");
  const content = parseBlogContent(contentRaw);

  const values = postSchema.parse({
    title,
    slug: slugInput ? slugify(slugInput) : slugify(title),
    excerpt: String(formData.get("excerpt") ?? "").trim() || undefined,
    category_id: categoryId || undefined,
    author_name: String(formData.get("author_name") ?? "").trim(),
    featured_image_url: String(formData.get("featured_image_url") ?? "").trim(),
    featured_image_alt: String(formData.get("featured_image_alt") ?? "").trim() || undefined,
    meta_title: String(formData.get("meta_title") ?? "").trim() || undefined,
    meta_description: String(formData.get("meta_description") ?? "").trim() || undefined,
    is_featured: formData.get("is_featured") !== null,
    faqs: (() => {
      const questions = formData.getAll("faq_question").map(String);
      const answers = formData.getAll("faq_answer").map(String);
      return questions
        .map((question, i) => ({ question: question.trim(), answer: (answers[i] ?? "").trim() }))
        .filter((f) => f.question !== "" || f.answer !== "");
    })(),
    tag_ids: formData.getAll("tag_ids").map(String).filter(Boolean),
    location_ids: formData.getAll("location_ids").map(String).filter(Boolean),
  });

  return { ...values, content };
}

async function replaceBlogFaqs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  faqs: { question: string; answer: string }[],
) {
  await supabase.from("blog_faqs").delete().eq("post_id", postId);
  if (faqs.length === 0) return;
  await supabase.from("blog_faqs").insert(
    faqs.map((faq, index) => ({ post_id: postId, question: faq.question, answer: faq.answer, sort_order: index })),
  );
}

async function replaceBlogPostTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  tagIds: string[],
) {
  await supabase.from("blog_post_tags").delete().eq("post_id", postId);
  if (tagIds.length === 0) return;

  // Validate every tag id actually exists before linking it.
  const { data: existing } = await supabase.from("blog_tags").select("id").in("id", tagIds);
  const validIds = new Set((existing ?? []).map((t) => t.id));
  const rows = tagIds.filter((id) => validIds.has(id)).map((tag_id) => ({ post_id: postId, tag_id }));
  if (rows.length > 0) await supabase.from("blog_post_tags").insert(rows);
}

async function replaceBlogPostLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  locationIds: string[],
) {
  await supabase.from("blog_post_locations").delete().eq("post_id", postId);
  if (locationIds.length === 0) return;

  // Validate every location id actually exists before linking it.
  const { data: existing } = await supabase.from("locations").select("id").in("id", locationIds);
  const validIds = new Set((existing ?? []).map((l) => l.id));
  const rows = locationIds.filter((id) => validIds.has(id)).map((location_id) => ({ post_id: postId, location_id }));
  if (rows.length > 0) await supabase.from("blog_post_locations").insert(rows);
}

export async function createBlogPost(formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  let values: ReturnType<typeof parseBlogPostForm>;
  try {
    values = parseBlogPostForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "Invalid form data.";
    redirect(`/admin/blog/new?error=${encodeURIComponent(message)}`);
  }

  const { faqs, tag_ids, location_ids, ...postValues } = values;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    // Explicit whitelist only — status is never taken from the create form,
    // every new post starts a draft regardless of what a request might send.
    .insert({
      title: postValues.title,
      slug: postValues.slug,
      excerpt: postValues.excerpt ?? null,
      content: postValues.content,
      category_id: postValues.category_id ?? null,
      author_name: postValues.author_name,
      author_id: admin.id,
      featured_image_url: postValues.featured_image_url ?? null,
      featured_image_alt: postValues.featured_image_alt ?? null,
      meta_title: postValues.meta_title ?? null,
      meta_description: postValues.meta_description ?? null,
      is_featured: postValues.is_featured,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    redirect(`/admin/blog/new?error=${encodeURIComponent(error.message)}`);
  }

  await replaceBlogFaqs(supabase, data.id, faqs);
  await replaceBlogPostTags(supabase, data.id, tag_ids);
  await replaceBlogPostLocations(supabase, data.id, location_ids);

  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function updateBlogPost(id: string, formData: FormData) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();

  const { data: existing } = await supabase.from("blog_posts").select("slug, published_at").eq("id", id).single();
  if (!existing) redirect("/admin/blog");

  let values: ReturnType<typeof parseBlogPostForm>;
  try {
    values = parseBlogPostForm(formData);
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "Invalid form data.";
    redirect(`/admin/blog/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  // Once a post has ever been published (published_at is set, even if it's
  // since been unpublished back to draft), its slug is permanently locked —
  // enforced here server-side regardless of what the submitted form carries.
  if (existing.published_at && values.slug !== existing.slug) {
    redirect(`/admin/blog/${id}/edit?error=${encodeURIComponent("Slug cannot be changed after the post has been published.")}`);
  }

  const { faqs, tag_ids, location_ids, ...postValues } = values;

  const { error } = await supabase
    .from("blog_posts")
    .update({
      title: postValues.title,
      slug: postValues.slug,
      excerpt: postValues.excerpt ?? null,
      content: postValues.content,
      category_id: postValues.category_id ?? null,
      author_name: postValues.author_name,
      featured_image_url: postValues.featured_image_url ?? null,
      featured_image_alt: postValues.featured_image_alt ?? null,
      meta_title: postValues.meta_title ?? null,
      meta_description: postValues.meta_description ?? null,
      is_featured: postValues.is_featured,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/blog/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await replaceBlogFaqs(supabase, id, faqs);
  await replaceBlogPostTags(supabase, id, tag_ids);
  await replaceBlogPostLocations(supabase, id, location_ids);

  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function deleteBlogPost(id: string) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createClient();
  // blog_faqs / blog_post_tags / blog_post_locations all cascade on delete.
  await supabase.from("blog_posts").delete().eq("id", id);
  revalidatePath("/admin/blog");
}

export async function toggleBlogPostStatus(id: string, nextStatus: unknown) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  // Runtime-validate the bound argument — never trust a hidden form field
  // or bind argument to carry a valid status. Throws a ZodError on tampering
  // (fail closed: the mutation never runs).
  const status = blogPostStatusSchema.parse(nextStatus);

  const supabase = await createClient();
  // published_at is set (once, and only once — see the migration trigger)
  // by the DB, never by this action.
  const { error } = await supabase.from("blog_posts").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/blog");
}

export async function toggleBlogPostFeatured(id: string, nextValue: unknown) {
  const admin = await getAuthorizedAdminUser();
  if (!admin) redirect("/admin/login");

  // Runtime-validate the bound argument — never trust a hidden form field
  // or bind argument to carry a non-boolean featured value. Throws a
  // ZodError on tampering (fail closed: the mutation never runs).
  const isFeatured = z.boolean().parse(nextValue);

  const supabase = await createClient();
  const { error } = await supabase.from("blog_posts").update({ is_featured: isFeatured }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/blog");
}

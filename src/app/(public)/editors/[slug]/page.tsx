import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEditorBySlug, getEditorPosts } from "@/lib/public-data";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { EditorAvatar, EditorSocials } from "@/components/public/editor-card";
import { JsonLd } from "@/components/public/json-ld";
import { absoluteUrl, buildBreadcrumbList, buildEditorPersonJsonLd, socialImageUrl } from "@/lib/jsonld";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const editor = await getEditorBySlug(slug);
  if (!editor) return {};

  const title = `${editor.name}${editor.roleTitle ? ` — ${editor.roleTitle}` : ""}`;
  const description =
    editor.bio?.slice(0, 155) || `${editor.name} writes pre-wedding photoshoot location guides for PhotoBlinks.`;
  const path = `/editors/${editor.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | PhotoBlinks`,
      description,
      url: path,
      siteName: "PhotoBlinks",
      type: "profile",
      images: editor.imageUrl ? [socialImageUrl(editor.imageUrl)] : undefined,
    },
  };
}

export default async function EditorPage({ params }: Props) {
  const { slug } = await params;
  const editor = await getEditorBySlug(slug);
  if (!editor) notFound();

  const posts = await getEditorPosts(editor.id, editor.isDefault);
  const path = `/editors/${editor.slug}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: editor.name, path },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: absoluteUrl(path),
    mainEntity: buildEditorPersonJsonLd(editor),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={breadcrumbs} includeJsonLd={false} />

      <header className="mt-6 flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
        <EditorAvatar editor={editor} size={128} />
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <div>
            <h1 className="font-heading text-3xl font-semibold">{editor.name}</h1>
            {editor.roleTitle && <p className="text-muted-foreground">{editor.roleTitle}</p>}
          </div>
          {editor.bio && <p className="leading-relaxed whitespace-pre-line text-foreground/90">{editor.bio}</p>}
          <EditorSocials editor={editor} />
        </div>
      </header>

      {posts.length > 0 && (
        <section className="mt-12 border-t pt-8">
          <h2 className="font-heading mb-4 text-xl font-semibold">Articles by {editor.name}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="flex flex-col gap-1 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="font-heading font-semibold">{post.title}</span>
                {post.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <JsonLd data={jsonLd} />
      <JsonLd data={buildBreadcrumbList(breadcrumbs)} />
    </div>
  );
}

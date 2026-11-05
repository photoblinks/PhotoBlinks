import Link from "next/link";
import Image from "next/image";
import { UserRound } from "lucide-react";
import type { PublicEditor } from "@/lib/public-data";

/** Social account chips. rel="me" ties the editor's page to these profiles
 * for search engines. */
export function EditorSocials({ editor }: { editor: PublicEditor }) {
  if (editor.socials.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {editor.socials.map((social) => (
        <li key={social.key}>
          <a
            href={social.url}
            target="_blank"
            rel="me noopener noreferrer"
            className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            {social.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function EditorAvatar({ editor, size }: { editor: PublicEditor; size: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-pb-brand/10" style={{ width: size, height: size }}>
      {editor.imageUrl ? (
        <Image src={editor.imageUrl} alt={editor.name} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <UserRound className="size-1/2 text-pb-brand" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

/** "Written by" box shown under blog posts and editorial blog sections. */
export function EditorCard({ editor }: { editor: PublicEditor }) {
  return (
    <aside className="mt-10 flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-start">
      <EditorAvatar editor={editor} size={80} />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Written by</p>
        <div>
          <Link href={`/editors/${editor.slug}`} className="font-heading text-lg font-semibold hover:underline">
            {editor.name}
          </Link>
          {editor.roleTitle && <p className="text-sm text-muted-foreground">{editor.roleTitle}</p>}
        </div>
        {editor.bio && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/85">{editor.bio}</p>}
        <EditorSocials editor={editor} />
      </div>
    </aside>
  );
}

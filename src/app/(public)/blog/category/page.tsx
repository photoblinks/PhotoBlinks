import { notFound } from "next/navigation";

// /blog/category with no slug isn't a real page — without this, Next would
// still 404 by default (no page.tsx here to render), but this makes that
// explicit rather than relying on the implicit fallback.
export default function BlogCategoryIndexPage() {
  notFound();
}

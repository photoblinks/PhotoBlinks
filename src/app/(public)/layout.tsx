import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { getActiveCategories } from "@/lib/public-data";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getActiveCategories();

  return (
    <div className="pb-theme relative flex min-h-screen flex-col bg-pb-cream">
      <Header categories={categories} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

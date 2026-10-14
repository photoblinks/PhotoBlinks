import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { MobileBottomNav } from "@/components/public/mobile-bottom-nav";
import { FavouritesProvider } from "@/components/public/favourites-provider";
import { Toaster } from "@/components/ui/sonner";
import { getActiveCategories } from "@/lib/public-data";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getActiveCategories();

  return (
    <FavouritesProvider>
      <div className="pb-theme relative flex min-h-screen flex-col bg-pb-cream pb-16 sm:pb-0">
        <Header categories={categories} />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <MobileBottomNav categories={categories} />
      <Toaster />
    </FavouritesProvider>
  );
}

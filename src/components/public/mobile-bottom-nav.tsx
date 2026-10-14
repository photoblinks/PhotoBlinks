"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Heart, Home, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { getActiveCategories } from "@/lib/public-data";

type Category = Awaited<ReturnType<typeof getActiveCategories>>[number];

const itemClass = "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.7rem] font-medium";

/** Mobile-only app-style bottom tab bar (hidden from the `sm` breakpoint up,
 * where the header nav takes over). */
export function MobileBottomNav({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const tone = (active: boolean) => (active ? "text-pb-brand" : "text-foreground/60");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <Link href="/" className={cn(itemClass, tone(isActive("/")))}>
        <Home className="size-5" />
        Home
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(itemClass, tone(pathname.startsWith("/category")))}
            />
          }
        >
          <LayoutGrid className="size-5" />
          Category
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="max-h-[60vh] overflow-y-auto">
          {categories.map((category) => (
            <DropdownMenuItem
              key={category.slug}
              render={<Link href={`/category/${category.slug}`} />}
            >
              {category.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Link href="/studios" className={cn(itemClass, tone(isActive("/studios")))}>
        <Camera className="size-5" />
        Studio
      </Link>
      <Link href="/favourites" className={cn(itemClass, tone(isActive("/favourites")))}>
        <Heart className="size-5" />
        Favourite
      </Link>
    </nav>
  );
}

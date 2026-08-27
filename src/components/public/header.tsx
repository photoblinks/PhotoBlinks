"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Aperture, ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { getActiveCategories } from "@/lib/public-data";

type Category = Awaited<ReturnType<typeof getActiveCategories>>[number];

function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Aperture className={light ? "size-6 text-white" : "size-6 text-pb-brand"} strokeWidth={1.75} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-heading text-lg font-semibold tracking-tight ${light ? "text-white" : ""}`}
        >
          PhotoBlinks
        </span>
        <span
          className={`text-[0.6rem] tracking-[0.2em] uppercase ${light ? "text-white/80" : "text-muted-foreground"}`}
        >
          Photoshoot Locations
        </span>
      </span>
    </Link>
  );
}

/** Category submenu shared by the desktop dropdown and the mobile burger
 * menu — both need the same "Category" entry that expands into the list
 * of active categories rather than linking anywhere itself. */
function CategoryItems({ categories }: { categories: Category[] }) {
  return categories.map((category) => (
    <DropdownMenuItem key={category.slug} render={<Link href={`/category/${category.slug}`} />}>
      {category.name}
    </DropdownMenuItem>
  ));
}

/** Desktop-only "Category" dropdown, styled to sit inline with the plain
 * text nav links. */
function CategoryDropdown({ categories }: { categories: Category[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
          />
        }
      >
        Category
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <CategoryItems categories={categories} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Burger menu used on mobile for every page, and always (any viewport)
 * on the home page's transparent hero header. */
function NavMenu({ light, categories }: { light?: boolean; categories: Category[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open menu"
            className={cn(
              "flex size-10 items-center justify-center rounded-full border transition-colors",
              light
                ? "border-white/30 text-white hover:bg-white/10"
                : "border-border text-foreground/70 hover:bg-muted",
            )}
          />
        }
      >
        <Menu className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href="/" />}>Home</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Category</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <CategoryItems categories={categories} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem render={<Link href="/studios" />}>Studios</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/locations/map" />}>Map</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo light />
          <NavMenu light categories={categories} />
          <Button render={<Link href="/locations" />} className="hidden sm:inline-flex">
            Explore Locations
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 text-sm font-semibold sm:flex sm:gap-7">
          <Link href="/" className="text-foreground/70 transition-colors hover:text-foreground">
            Home
          </Link>
          <CategoryDropdown categories={categories} />
          <Link href="/studios" className="text-foreground/70 transition-colors hover:text-foreground">
            Studios
          </Link>
          <Link
            href="/locations/map"
            className="text-foreground/70 transition-colors hover:text-foreground"
          >
            Map
          </Link>
        </nav>
        <div className="sm:hidden">
          <NavMenu categories={categories} />
        </div>
      </div>
    </header>
  );
}

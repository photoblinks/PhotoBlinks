import Link from "next/link";
import { Aperture } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/locations", label: "Locations" },
  { href: "/studios", label: "Studios" },
  { href: "/locations/map", label: "Map" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Aperture className="size-6 text-pb-brand" strokeWidth={1.75} />
          <span className="flex flex-col leading-none">
            <span className="font-heading text-lg font-semibold tracking-tight">PhotoBlinks</span>
            <span className="text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
              Photoshoot Locations
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm sm:gap-7">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-foreground/70 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

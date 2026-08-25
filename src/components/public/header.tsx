import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          PhotoBlinks
        </Link>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          <Link href="/" className="text-foreground/80 hover:text-foreground">
            Home
          </Link>
          <Link href="/locations/map" className="text-foreground/80 hover:text-foreground">
            Map
          </Link>
        </nav>
      </div>
    </header>
  );
}

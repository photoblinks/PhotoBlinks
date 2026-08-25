export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <span className="font-medium text-foreground">PhotoBlinks</span>
        <p>Discover photoshoot locations across Karnataka and Kerala.</p>
        <p>© {new Date().getFullYear()} PhotoBlinks. All rights reserved.</p>
      </div>
    </footer>
  );
}

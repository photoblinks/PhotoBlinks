import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Plain GET-form search bar for studio directory pages (country/state/
 * city) — no client JS needed since it just navigates to `?q=`. */
export function StudioSearch({ basePath, q }: { basePath: string; q?: string }) {
  return (
    <form
      action={basePath}
      method="get"
      className="mt-6 flex max-w-md items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm"
    >
      <Search className="ml-1 size-4 shrink-0 text-pb-brand" />
      <Input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search studios by name…"
        className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="sm">
        Search
      </Button>
    </form>
  );
}

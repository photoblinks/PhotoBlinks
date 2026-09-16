"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import { saveLocationCollection, validateShareName } from "./actions";

const LIST_PATH = "/photographer/share-location";
const NEW_PATH = "/photographer/share-location/new";

type SelectedLocation = { id: string; name: string };

type ShareSelection = {
  collectionId: string | null;
  name: string;
  setName: (name: string) => void;
  selected: SelectedLocation[];
  add: (location: SelectedLocation) => void;
  remove: (id: string) => void;
};

const ShareSelectionContext = createContext<ShareSelection | null>(null);

function useShareSelection() {
  const ctx = useContext(ShareSelectionContext);
  if (!ctx) throw new Error("useShareSelection must be used within a ShareSelectionProvider");
  return ctx;
}

/** Holds the in-progress share (name + ordered selection). Mounted from a
 * LAYOUT, not a page: Next remounts a page whenever its search params change,
 * and the reused homepage filter navigates by search params — state kept here
 * survives every search/filter change. */
export function ShareSelectionProvider({
  collectionId,
  initialName,
  initialSelection,
  children,
}: {
  collectionId: string | null;
  initialName: string;
  initialSelection: SelectedLocation[];
  children: React.ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState(initialSelection);

  function add(location: SelectedLocation) {
    setSelected((current) => (current.some((l) => l.id === location.id) ? current : [...current, location]));
  }

  function remove(id: string) {
    setSelected((current) => current.filter((l) => l.id !== id));
  }

  return (
    <ShareSelectionContext.Provider value={{ collectionId, name, setName, selected, add, remove }}>
      {children}
    </ShareSelectionContext.Provider>
  );
}

/** Step 1 of a new share: the name, validated server-side before the picker opens. */
export function ShareNameForm() {
  const { name, setName } = useShareSelection();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await validateShareName(value);
      if (result.error || !result.name) {
        setError(result.error ?? "Enter a name for this share.");
        return;
      }
      setName(result.name);
      router.push(`${NEW_PATH}/select`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="share-name">Shareable Location Name</Label>
        <Input
          id="share-name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Rahul & Priya Pre-Wedding Locations"
          maxLength={100}
          required
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </Button>
        <Button render={<Link href={LIST_PATH} />} variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Sticky summary above the catalog: the share name, selected locations
 * (removable), and the final save action. */
export function ShareSelectionBar() {
  const { collectionId, name, selected, remove } = useShareSelection();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A new share's name lives only in the layout's state — after a hard
  // reload it's gone, so send the photographer back to the name step.
  useEffect(() => {
    if (!collectionId && !name) router.replace(NEW_PATH);
  }, [collectionId, name, router]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      // Success redirects to the share list from the server action.
      const result = await saveLocationCollection({
        collectionId,
        name,
        locationIds: selected.map((l) => l.id),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">
              {selected.length} location{selected.length === 1 ? "" : "s"} selected
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button render={<Link href={LIST_PATH} />} variant="outline" size="sm">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={pending || selected.length === 0}>
              {pending ? "Saving…" : collectionId ? "Save Changes" : "Create Share Link"}
            </Button>
          </div>
        </div>
        {error && <FieldError>{error}</FieldError>}
        {selected.length > 0 && (
          <ul className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
            {selected.map((location) => (
              <li
                key={location.id}
                className="flex items-center gap-1 rounded-full border bg-muted py-0.5 pr-1 pl-3 text-sm"
              >
                <span className="max-w-48 truncate">{location.name}</span>
                <button
                  type="button"
                  onClick={() => remove(location.id)}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={`Remove ${location.name}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Per-card actions, in the required order: [Add to List] [Open]. */
export function ShareCardActions({ id, name, slug }: SelectedLocation & { slug: string }) {
  const { selected, add, remove } = useShareSelection();
  const isAdded = selected.some((l) => l.id === id);

  return (
    <div className="grid grid-cols-2 gap-2">
      {isAdded ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => remove(id)}
          aria-label={`Added — remove ${name} from list`}
          title="Click to remove"
        >
          <Check className="size-3.5" aria-hidden="true" />
          Added
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => add({ id, name })}>
          Add to List
        </Button>
      )}
      {/* New tab: navigating away would drop the in-progress selection. */}
      <Button
        render={<a href={`/location/${slug}`} target="_blank" rel="noopener noreferrer" />}
        size="sm"
        variant="outline"
      >
        Open
      </Button>
    </div>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
      {copied ? "Copied!" : "Copy Link"}
    </Button>
  );
}

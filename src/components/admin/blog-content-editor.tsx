"use client";

import { useEffect, useRef, useState } from "react";
import { BlockInserter, BLOCK_LIBRARY } from "./blog-editor/block-inserter";
import { BlockToolbar } from "./blog-editor/block-toolbar";
import { BlockFields } from "./blog-editor/block-fields";
import { makeBlock, toSubmittable, blockLabel, type Block, type BlockType } from "./blog-editor/types";
import { clipboardToBlocks } from "./blog-editor/paste-to-blocks";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";

export type { BlogBlockInput } from "./blog-editor/types";

/**
 * Gutenberg-style block canvas for the blog CMS. Blocks are stacked
 * vertically; each is independently selectable/editable, reorderable via
 * native HTML5 drag-and-drop (no drag-and-drop library), and carries a
 * contextual toolbar (move up/down, duplicate, delete) when selected. A "+"
 * inserter sits between every pair of blocks plus at the very top/bottom.
 *
 * Output contract is unchanged from the previous editor: a single hidden
 * `content_json` input carrying `JSON.stringify(blocks-without-client-id)`,
 * re-validated authoritatively server-side by blogContentSchema — this
 * component only needs to produce well-shaped JSON, never enforces the
 * content/security rules itself.
 */
export function BlogContentEditor({
  name,
  slug,
  locations,
  defaultValue,
  allowedBlockTypes,
}: {
  name: string;
  slug: string;
  locations: { id: string; name: string }[];
  defaultValue?: import("./blog-editor/types").BlogBlockInput[];
  allowedBlockTypes?: readonly BlockType[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(
    (defaultValue ?? []).map((b) => ({ ...(b as Block), id: crypto.randomUUID() })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<string | null>(null);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [restoreDraft, setRestoreDraft] = useState<Block[] | null>(null);

  // Lightweight, dependency-free "autosave" — persists the in-progress
  // block array to localStorage (never to a server/DB) so an accidental tab
  // close or crash before the form is submitted doesn't lose work. Keyed by
  // slug (the closest thing to a stable per-post identity available on the
  // client for a not-yet-created draft) so it self-scopes per post without
  // any new backend infrastructure.
  const draftKey = `photoblinks-blog-draft:${slug || "untitled"}`;
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Block[];
      if (JSON.stringify(parsed) !== JSON.stringify(blocks)) {
        // Deferred so this isn't a synchronous setState inside the effect body
        // (react-hooks/set-state-in-effect) — rendered result is unchanged.
        queueMicrotask(() => setRestoreDraft(parsed));
      }
    } catch {
      // Corrupt/unavailable localStorage entry — ignore, editor still works.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(blocks));
      } catch {
        // Storage full/unavailable — autosave is a convenience, not a
        // requirement; silently skip rather than interrupting editing.
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [blocks, draftKey]);

  // Top-toolbar insert: new block goes right after the selected one, else at the end.
  function insertAfterSelected(type: BlockType) {
    const index = blocks.findIndex((b) => b.id === selectedId);
    insertAt(index === -1 ? blocks.length : index + 1, type);
  }

  function insertAt(index: number, type: BlockType) {
    const block = makeBlock(type);
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(index, 0, block);
      return next;
    });
    setSelectedId(block.id);
  }

  // Pasted articles (ChatGPT/Claude/web) become blocks automatically. Single
  // block / plain snippets fall through to the normal text-field paste.
  function insertPasted(pasted: Block[]) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === selectedId);
      const sel = prev[index];
      const isEmpty = sel && (sel.type === "paragraph" || sel.type === "heading") && !sel.text.trim();
      const next = [...prev];
      next.splice(index === -1 ? prev.length : isEmpty ? index : index + 1, isEmpty ? 1 : 0, ...pasted);
      return next;
    });
    setSelectedId(pasted[pasted.length - 1].id);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = clipboardToBlocks(e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain"));
    if (!pasted.length) return;
    e.preventDefault();
    insertPasted(pasted);
  }

  // Toolbar "Paste article" button: reads the clipboard directly (browser
  // asks for permission once), so no focused field is needed.
  async function pasteFromClipboard() {
    try {
      let html = "";
      let text = "";
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        if (item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
      }
      const pasted = clipboardToBlocks(html, text);
      if (pasted.length) insertPasted(pasted);
      else setPasteMessage("Clipboard has no multi-section article text to convert.");
    } catch {
      setPasteMessage("Clipboard access blocked. Click inside the editor and press Ctrl+V instead.");
    }
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateBlock(id: string) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const copy = { ...prev[index], id: crypto.randomUUID() } as Block;
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    setBlocks((prev) => {
      const fromIndex = prev.findIndex((b) => b.id === fromId);
      const toIndex = prev.findIndex((b) => b.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  const jsonValue = JSON.stringify(blocks.map(toSubmittable));

  return (
    <div className="rounded-xl border bg-white p-4 outline-none sm:p-6" tabIndex={-1} onPaste={handlePaste}>
      <input type="hidden" name={name} value={jsonValue} />

      {restoreDraft && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span>We found unsaved block changes from a previous session.</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setBlocks(restoreDraft);
                setRestoreDraft(null);
              }}
            >
              Restore
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRestoreDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-white/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-5">
        {BLOCK_LIBRARY.filter((b) => !allowedBlockTypes || allowedBlockTypes.includes(b.type)).map((item) => (
          <Button
            key={item.type}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={item.label}
            aria-label={`Add ${item.label}`}
            onClick={() => insertAfterSelected(item.type)}
          >
            <item.icon className="size-4" />
          </Button>
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="ghost" size="sm" onClick={pasteFromClipboard} title="Convert copied article text into blocks">
          <ClipboardPaste className="size-4" />
          Paste article
        </Button>
      </div>

      {pasteMessage && <p className="mb-3 text-sm text-amber-700">{pasteMessage}</p>}

      <div className="flex flex-col">
        <InsertGap blockTypes={allowedBlockTypes} onInsert={(type) => insertAt(0, type)} />

        {blocks.map((block, index) => (
          <div key={block.id}>
            <div
              draggable={dragEnabledId === block.id}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", block.id);
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(block.id);
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === block.id) return;
                e.preventDefault();
                setDragOverId(block.id);
              }}
              onDragLeave={() => setDragOverId((prev) => (prev === block.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) reorder(draggingId, block.id);
                setDraggingId(null);
                setDragOverId(null);
                setDragEnabledId(null);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
                setDragEnabledId(null);
              }}
              onClick={() => setSelectedId(block.id)}
              className={`group/block relative rounded-lg border-2 p-3 transition-colors ${
                selectedId === block.id ? "border-pb-brand/50 bg-pb-brand/[0.03]" : "border-transparent hover:border-border"
              } ${dragOverId === block.id ? "border-t-4 border-t-pb-brand" : ""} ${draggingId === block.id ? "opacity-40" : ""}`}
            >
              {selectedId === block.id && (
                <div className="absolute -top-4 left-2 z-10">
                  <BlockToolbar
                    label={blockLabel(block)}
                    canMoveUp={index > 0}
                    canMoveDown={index < blocks.length - 1}
                    onMoveUp={() => moveBlock(block.id, -1)}
                    onMoveDown={() => moveBlock(block.id, 1)}
                    onDuplicate={() => duplicateBlock(block.id)}
                    onDelete={() => removeBlock(block.id)}
                    dragHandleProps={{
                      onMouseDown: () => setDragEnabledId(block.id),
                    }}
                  />
                </div>
              )}

              <BlockFields block={block} slug={slug} locations={locations} onChange={(patch) => updateBlock(block.id, patch)} />
            </div>

            <InsertGap blockTypes={allowedBlockTypes} onInsert={(type) => insertAt(index + 1, type)} />
          </div>
        ))}

        {blocks.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8">
            <BlockInserter
              variant="button"
              blockTypes={allowedBlockTypes}
              onInsert={(type) => insertAt(0, type)}
            />
            <p className="text-sm text-muted-foreground">
              Or copy a full article from ChatGPT/Claude, click here and press Ctrl+V — headings, paragraphs and
              lists convert automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function InsertGap({
  onInsert,
  blockTypes,
}: {
  onInsert: (type: BlockType) => void;
  blockTypes?: readonly BlockType[];
}) {
  return (
    <div className="h-3">
      <BlockInserter onInsert={onInsert} blockTypes={blockTypes} />
    </div>
  );
}

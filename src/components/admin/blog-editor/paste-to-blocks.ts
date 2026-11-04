// Converts pasted AI/web article content (rich HTML or Markdown) into editor
// blocks. Output is limited to heading/paragraph/list/quote/divider — all valid
// in both blog and editorial schemas. Text is plain; the server still
// re-validates every field.

import type { Block } from "./types";

type Draft =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] }
  | { type: "quote"; text: string; attribution: string }
  | { type: "divider" };

// The post title is the page H1, so H1/H2 both become H2 and deeper become H3.
const headingLevel = (n: number): 2 | 3 => (n <= 2 ? 2 : 3);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function stripInlineMarkdown(s: string): string {
  return clean(
    s
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|\W)([*_])(\S(?:.*?\S)?)\2(?=\W|$)/g, "$1$3")
      .replace(/`([^`]+)`/g, "$1"),
  );
}

function parseMarkdown(text: string): Draft[] {
  const out: Draft[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let list: { style: "ordered" | "unordered"; items: string[] } | null = null;

  const flush = () => {
    if (para.length) out.push({ type: "paragraph", text: stripInlineMarkdown(para.join(" ")) });
    if (quote.length) out.push({ type: "quote", text: stripInlineMarkdown(quote.join(" ")), attribution: "" });
    if (list) out.push({ type: "list", ...list });
    para = [];
    quote = [];
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    const quoted = /^>\s?(.*)$/.exec(line);

    if (!line) flush();
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      out.push({ type: "divider" });
    } else if (heading) {
      flush();
      out.push({ type: "heading", level: headingLevel(heading[1].length), text: stripInlineMarkdown(heading[2]) });
    } else if (bullet || numbered) {
      const style = bullet ? "unordered" : "ordered";
      if (list && list.style !== style) flush();
      else if (!list) flush();
      list ??= { style, items: [] };
      list.items.push(stripInlineMarkdown((bullet ?? numbered)![1]));
    } else if (quoted) {
      if (!quote.length) flush();
      if (quoted[1]) quote.push(quoted[1]);
    } else {
      // Indented continuation of a list item, otherwise paragraph text.
      if (list && /^\s/.test(raw)) list.items[list.items.length - 1] += " " + stripInlineMarkdown(line);
      else {
        if (list || quote.length) flush();
        para.push(line);
      }
    }
  }
  flush();
  return out.filter((d) => d.type === "divider" || ("text" in d ? d.text : d.items.some(Boolean)));
}

const BLOCK_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "BLOCKQUOTE", "HR", "PRE"]);

function parseHtml(html: string): Draft[] {
  const out: Draft[] = [];
  const walk = (node: Element) => {
    for (const el of Array.from(node.children)) {
      const tag = el.tagName;
      const text = clean(el.textContent ?? "");
      if (/^H[1-6]$/.test(tag)) {
        if (text) out.push({ type: "heading", level: headingLevel(Number(tag[1])), text });
      } else if (tag === "UL" || tag === "OL") {
        const items = Array.from(el.querySelectorAll("li"))
          .map((li) => clean(li.textContent ?? ""))
          .filter(Boolean);
        if (items.length) out.push({ type: "list", style: tag === "OL" ? "ordered" : "unordered", items });
      } else if (tag === "BLOCKQUOTE") {
        if (text) out.push({ type: "quote", text, attribution: "" });
      } else if (tag === "HR") {
        out.push({ type: "divider" });
      } else if (tag === "P" || tag === "PRE") {
        if (text) out.push({ type: "paragraph", text });
      } else if (el.querySelector([...BLOCK_TAGS].join(","))) {
        walk(el);
      } else if (text && tag !== "META" && tag !== "STYLE" && tag !== "SCRIPT") {
        out.push({ type: "paragraph", text });
      }
    }
  };
  walk(new DOMParser().parseFromString(html, "text/html").body);
  return out;
}

/** Returns blocks for a clipboard payload, or [] when it is not structured
 * content (so the caller leaves the paste untouched). */
export function clipboardToBlocks(html: string, text: string): Block[] {
  const hasStructure = /<(h[1-6]|p|ul|ol|blockquote)[\s>]/i.test(html);
  const drafts = (hasStructure ? parseHtml(html) : parseMarkdown(text)).flatMap(
    // List items are capped at 300 chars server-side; AI bullets often exceed it,
    // so such a list becomes one paragraph per item.
    (d): Draft[] =>
      d.type === "list" && d.items.some((i) => i.length > 300)
        ? d.items.map((text) => ({ type: "paragraph", text }))
        : [d],
  );
  return drafts.length > 1 ? drafts.map((d) => ({ id: crypto.randomUUID(), ...d }) as Block) : [];
}

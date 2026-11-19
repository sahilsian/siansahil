// The websites store rich text as a small markdown subset, read one line at a time:
//   # to ###### headings, "- " / "1. " list items, other lines are paragraphs,
//   inline **bold**, *italic* and [label](href).
// These helpers convert between that and the rich text editor, using only
// features the websites can display.

import type { JSONContent } from "@tiptap/react";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only links the site can follow safely. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(h) || h.startsWith("/") || h.startsWith("#")) return h;
  return null;
}

function inlineToHtml(text: string): string {
  // Same pattern as the websites' tokenizer: link | bold | italic.
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = safeHref(m[2]);
      out += href ? `<a href="${escapeHtml(href)}">${escapeHtml(m[1])}</a>` : escapeHtml(m[1]);
    } else if (m[3] !== undefined) {
      out += `<strong>${escapeHtml(m[3])}</strong>`;
    } else {
      out += `<em>${escapeHtml(m[4])}</em>`;
    }
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** Stored markdown → HTML for the editor to load. */
export function markdownToHtml(markdown: string): string {
  const html: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li><p>${i}</p></li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(inlineToHtml((bullet ?? numbered)![1]));
      continue;
    }
    flush();
    if (heading) {
      // The editor supports heading levels 1–3; deeper levels show as level 3.
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${inlineToHtml(heading[2])}</h${level}>`);
    } else {
      html.push(`<p>${inlineToHtml(line)}</p>`);
    }
  }
  flush();
  return html.join("");
}

function inlineToMarkdown(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text" || !node.text) return "";
      let text = node.text;
      const marks = node.marks ?? [];
      const link = marks.find((m) => m.type === "link");
      if (marks.some((m) => m.type === "italic")) text = `*${text}*`;
      if (marks.some((m) => m.type === "bold")) text = `**${text}**`;
      const href = link ? safeHref(String(link.attrs?.href ?? "")) : null;
      if (href) text = `[${node.text}](${href})`;
      return text;
    })
    .join("");
}

/** Editor content → markdown to store. Each paragraph/line becomes its own line. */
export function docToMarkdown(doc: JSONContent): string {
  const blocks: string[] = [];
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 2);
        const text = inlineToMarkdown(node.content).replace(/\n/g, " ").trim();
        if (text) blocks.push(`${"#".repeat(level)} ${text}`);
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = (node.content ?? []).flatMap((item) =>
          (item.content ?? []).flatMap((p) => lines(inlineToMarkdown(p.content))),
        );
        if (items.length)
          blocks.push(items.map((t, i) => (node.type === "bulletList" ? `- ${t}` : `${i + 1}. ${t}`)).join("\n"));
        break;
      }
      default:
        blocks.push(...lines(inlineToMarkdown(node.content)));
    }
  }
  return blocks.join("\n\n");
}

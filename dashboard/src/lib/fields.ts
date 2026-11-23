// Finds every editable piece of text in a content document and gives it a
// human-readable label and section. Keep LOCKED_KEYS / LOCKED_SECTIONS in step with
// server/src/dashboard/text_only.rs (the server enforces them; this only hides them).

export type Path = (string | number)[];

export interface TextField {
  path: Path;
  /** Stable id for React keys. */
  id: string;
  section: string;
  label: string;
  value: string;
  kind: "line" | "multiline" | "rich";
}

const LOCKED_KEYS = new Set([
  "$type", "slug", "type", "id", "url", "to", "href", "formId", "defaultCollection", "fieldType", "variant",
  "imagePosition", "locale", "currency", "robots", "category", "sort", "status", "shopifyHandle",
  "subscriptionHandle", "printClubHandle", "titleTemplate",
]);
const LOCKED_SECTIONS = new Set(["theme", "favicons", "integrations", "filter", "search", "fonts", "views", "store"]);
/** Image file names: not shown to visitors, so not worth editing. */
const HIDDEN_KEYS = new Set(["name"]);

/** Fields stored as rich text (markdown) on the websites. */
const RICH_KEYS = new Set(["body", "answer", "intro", "announcement", "details", "closing"]);

const LABELS: Record<string, string> = {
  seo: "Search engines & link previews",
  title: "Title",
  description: "Description",
  keywords: "Keywords",
  siteName: "Site name",
  ogImage: "Preview image",
  layout: "Page heading",
  heroImage: "Main image",
  profileImage: "Profile image",
  image: "Image",
  alternativeText: "Image description (for screen readers)",
  primary: "Main button",
  secondary: "Second button",
  label: "Text",
  question: "Question",
  answer: "Answer",
  body: "Text",
  placeholder: "Placeholder",
  successMessage: "Message after sending",
  errorMessage: "Message if sending fails",
  consentPrefix: "Consent text",
  consentLink: "Consent link",
  header: "Header",
  footer: "Footer",
  mailing: "Mailing list",
  labels: "Buttons & labels",
  messages: "Messages",
  contact: "Contact",
  email: "Email",
  social: "Social",
  instagram: "Instagram",
  handle: "Handle",
  nav: "Navigation",
  name: "Name",
};

/** Names for numbered items inside a list, by the list's key. */
const ITEM_NAMES: Record<string, string> = {
  items: "Item",
  groups: "Column",
  fields: "Field",
  tabs: "Section",
  blocks: "Block",
  images: "Image",
  customPrintingFeatures: "Feature",
};

const BLOCK_NAMES: Record<string, string> = {
  hero: "Top of page",
  imageText: "Image & text",
  faq: "Questions",
  richText: "Text",
  form: "Form",
  collection: "Gallery",
  printClub: "Print club",
};

const SITE_SECTIONS: Record<string, string> = {
  name: "General",
  contact: "General",
  social: "General",
  seo: "Search engines & link previews",
  mailing: "Mailing list",
  labels: "Buttons & labels",
  messages: "Messages",
};

export function humanize(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const NAME_KEYS = ["question", "title", "name", "label"];

function labelFor(path: Path, root: unknown): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (typeof seg === "number") {
      const listKey = String(path[i - 1] ?? "");
      // Prefer something recognisable from the item itself.
      const item = getAt(root, path.slice(0, i + 1)) as Record<string, unknown> | undefined;
      const named = item && typeof item === "object" ? (item.question ?? item.title ?? item.name ?? item.label) : undefined;
      // Name list items after what they are: FAQ entries, navigation links, ...
      const kind =
        item && typeof item === "object" && "question" in item
          ? "Question"
          : item && typeof item === "object" && "to" in item
            ? "Link"
            : (ITEM_NAMES[listKey] ?? "Item");
      const base = `${kind} ${seg + 1}`;
      // Replace the list's own label with the numbered item name.
      if (parts.length && parts[parts.length - 1] === humanize(listKey)) parts.pop();
      // "Question 3" is clearer than "Question 3 › Question".
      if (path[i + 1] === "question" && i + 2 === path.length) {
        parts.push(base);
        break;
      }
      // Show the item's name, unless the field being labelled *is* that name.
      const showName =
        kind !== "Question" && typeof named === "string" && named !== "" && !NAME_KEYS.includes(String(path[i + 1]));
      parts.push(showName ? `${base} (“${truncate(named as string, 30)}”)` : base);
    } else {
      parts.push(humanize(seg));
    }
  }
  return parts.join(" › ") || "Text";
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function getAt(root: unknown, path: Path): unknown {
  let cur = root as any;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** A copy of `root` with the value at `path` replaced. */
export function setAt<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const copy: any = Array.isArray(root) ? [...root] : { ...(root as object) };
  copy[head] = setAt(copy[head], rest, value);
  return copy;
}

function sectionFor(docType: string, path: Path, root: unknown): { section: string; rest: Path } {
  const [first, second] = path;
  if (docType === "page" && first === "blocks" && typeof second === "number") {
    const block = getAt(root, ["blocks", second]) as { type?: string } | undefined;
    const name = BLOCK_NAMES[block?.type ?? ""] ?? humanize(block?.type ?? "Block");
    const blocks = getAt(root, ["blocks"]) as unknown[];
    const sameType = blocks.filter((b: any) => b?.type === block?.type).length;
    return { section: sameType > 1 ? `${name} (${second + 1})` : name, rest: path.slice(2) };
  }
  if (docType === "site") {
    if (first === "nav" && (second === "header" || second === "footer")) {
      return { section: second === "header" ? "Header" : "Footer", rest: path.slice(2) };
    }
    if (first === "nav") return { section: "Navigation", rest: path.slice(1) };
    const section = SITE_SECTIONS[String(first)] ?? humanize(String(first));
    // Within "General", keep the key in the label; elsewhere drop the section key.
    return section === "General" ? { section, rest: path } : { section, rest: path.slice(1) };
  }
  if (docType === "form") {
    return { section: first === "fields" ? "Form fields" : "Form", rest: path };
  }
  if (first === "seo") return { section: LABELS.seo, rest: path.slice(1) };
  if (first === "layout") return { section: LABELS.layout, rest: path.slice(1) };
  return { section: "General", rest: path };
}

/** Every editable text value in a document, in document order. */
export function collectFields(docType: string, doc: unknown): TextField[] {
  const out: TextField[] = [];
  const walk = (value: unknown, path: Path) => {
    if (typeof value === "string") {
      const key = String([...path].reverse().find((p) => typeof p === "string") ?? "");
      const { section, rest } = sectionFor(docType, path, doc);
      const label = labelFor(rest, getAt(doc, path.slice(0, path.length - rest.length)));
      const kind = RICH_KEYS.has(key) ? "rich" : value.includes("\n") || value.length > 90 ? "multiline" : "line";
      out.push({ path, id: path.join("."), section, label, value, kind });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, i]));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of orderedEntries(value)) {
        if (LOCKED_KEYS.has(key) || LOCKED_SECTIONS.has(key)) continue;
        if (HIDDEN_KEYS.has(key) && isImage(value)) continue;
        walk(child, [...path, key]);
      }
    }
  };
  walk(doc, []);
  return out;
}

function isImage(value: object): boolean {
  return "url" in value && "width" in value && "height" in value;
}

/**
 * The database stores object keys in its own order (shortest first), so put the
 * keys people expect first — title before description, question before answer —
 * and keep the rest alphabetical.
 */
const KEY_ORDER = [
  "name", "title", "question", "label", "subtitle", "description", "answer", "body", "intro", "announcement",
  "details", "closing", "placeholder", "successMessage", "errorMessage", "header", "footer", "items", "groups",
];

function orderedEntries(value: object): [string, unknown][] {
  const rank = (k: string) => {
    const i = KEY_ORDER.indexOf(k);
    return i === -1 ? KEY_ORDER.length : i;
  };
  return Object.entries(value).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Where each section goes on screen; anything unlisted goes in the middle. */
const SECTION_ORDER: Record<string, number> = {
  "Page heading": 0,
  Header: 0,
  Footer: 1,
  "Mailing list": 2,
  General: 3,
  Form: 0,
  "Form fields": 1,
  "Buttons & labels": 4,
  Messages: 5,
  "Search engines & link previews": 99,
};

/** Fields grouped by section, in a sensible reading order. */
export function groupFields(fields: TextField[]): { section: string; fields: TextField[] }[] {
  const groups = new Map<string, TextField[]>();
  for (const f of fields) {
    if (!groups.has(f.section)) groups.set(f.section, []);
    groups.get(f.section)!.push(f);
  }
  const rank = (s: string) => SECTION_ORDER[s] ?? 50;
  return [...groups]
    .map(([section, fields], i) => ({ section, fields, i }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.i - b.i)
    .map(({ section, fields }) => ({ section, fields }));
}

import { useSite } from "../session";

/**
 * The words this site uses for its gallery items, from site.json `terms`
 * (e.g. "event" / "events" for a performer). Defaults to artwork / artworks.
 */
export function useTerms() {
  const { site } = useSite();
  const item = site.terms?.item?.trim() || "artwork";
  const items = site.terms?.items?.trim() || `${item}s`;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return {
    item,
    items,
    Item: cap(item),
    Items: cap(items),
    /** Artworks are paintings with sizes, originals and prints; other kinds of items aren't. */
    isArt: item === "artwork",
    prints: site.features?.prints !== false,
  };
}

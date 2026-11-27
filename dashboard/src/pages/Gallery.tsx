import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Plus, Search } from "lucide-react";
import { api, type Artwork } from "../api";
import { useSite } from "../session";
import { previewUrl } from "../lib/images";
import { Alert, PageHeader, Spinner, TextInput, errorMessage } from "../components/ui";
import { TextEditor, type DocRef } from "./TextEditor";
import { useTerms } from "../lib/terms";

const STATUS_STYLES: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  sold: "bg-stone-200 text-stone-700",
  unavailable: "bg-amber-100 text-amber-800",
};

function ArtworkCard({ artwork, siteUrl }: { artwork: Artwork; siteUrl: string | null }) {
  const image = artwork.images?.[0];
  const status = artwork.availability?.status;
  return (
    <Link
      to={`/gallery/${artwork.slug}`}
      className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:border-stone-400"
    >
      <div className="aspect-square bg-stone-100">
        {image ? (
          <img
            src={previewUrl(image.url, siteUrl)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:opacity-90"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <ImageOff size={28} />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-stone-900">{artwork.title}</p>
        {status && (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] ?? ""}`}>
            {status}
          </span>
        )}
      </div>
    </Link>
  );
}

function ArtworkList() {
  const { site } = useSite();
  const terms = useTerms();
  const { data, isLoading, error } = useQuery({ queryKey: ["artworks", site.id], queryFn: () => api.artworks(site.id) });
  const [search, setSearch] = useState("");

  // Gallery order first (as visitors see it), then everything else by title.
  const sorted = useMemo(() => {
    if (!data) return [];
    const order = data.collections.find((c) => c.curated && c.id === "gallery")?.productSlugs ?? [];
    const rank = (a: Artwork) => {
      const i = order.indexOf(a.slug);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const needle = search.trim().toLowerCase();
    return [...data.artworks]
      .filter((a) => !needle || a.title.toLowerCase().includes(needle))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [data, search]);

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
        <TextInput
          type="search"
          placeholder={`Search ${terms.items}`}
          aria-label={`Search ${terms.items}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      {sorted.length === 0 ? (
        <Alert kind="info">{search ? `No ${terms.items} match your search.` : `No ${terms.items} yet. Add your first one!`}</Alert>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((a) => (
            <ArtworkCard key={a.slug} artwork={a} siteUrl={site.url} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryText() {
  const { site } = useSite();
  const terms = useTerms();
  const { data } = useQuery({ queryKey: ["documents", site.id], queryFn: () => api.documents(site.id) });
  if (!data) return <Spinner />;
  const refs: DocRef[] = [];
  if (data.some((d) => d.type === "page" && d.key === "products")) {
    refs.push({ type: "page", key: "products", title: `${terms.isArt ? "Gallery" : terms.Items} page` });
  }
  for (const d of data.filter((d) => d.type === "collection")) {
    refs.push({ type: "collection", key: d.key, title: `List: ${d.key}` });
  }
  if (refs.length === 0) return <Alert kind="info">{`This site has no ${terms.isArt ? "gallery" : terms.items} text to edit.`}</Alert>;
  return <TextEditor refs={refs} />;
}

export function Gallery() {
  const [tab, setTab] = useState<"artworks" | "text">("artworks");
  const terms = useTerms();
  const section = terms.isArt ? "Gallery" : terms.Items;
  return (
    <div>
      <PageHeader
        title={section}
        description={`Add, edit and remove ${terms.items}.`}
        actions={
          tab === "artworks" && (
            <Link
              to="/gallery/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700"
            >
              <Plus size={18} /> Add {terms.item}
            </Link>
          )
        }
      />
      <div className="mb-5 inline-flex rounded-lg border border-stone-200 bg-white p-1" role="tablist">
        {(
          [
            ["artworks", terms.Items],
            ["text", `${section} text`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-10 rounded-md px-4 text-sm font-medium ${tab === id ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "artworks" ? <ArtworkList /> : <GalleryText />}
    </div>
  );
}

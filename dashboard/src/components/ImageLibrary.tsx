import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Images, Search, X } from "lucide-react";
import { api, type Image, type LibraryImage } from "../api";
import { previewUrl } from "../lib/images";
import { Alert, Button, Spinner, TextInput, errorMessage } from "./ui";

/**
 * "Choose from uploaded": a button that opens every image the site already has
 * (uploads and photos on artworks/prints), so the same photo isn't uploaded twice.
 */
export function ImageLibraryButton({
  siteId,
  siteUrl,
  current,
  onPick,
}: {
  siteId: string;
  siteUrl: string | null;
  /** Images already on this artwork/print (shown as added). */
  current: Image[];
  onPick: (images: Image[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Images size={18} /> Choose from uploaded
      </Button>
      {open && (
        <LibraryDialog
          siteId={siteId}
          siteUrl={siteUrl}
          current={current}
          onClose={() => setOpen(false)}
          onPick={(images) => {
            onPick(images);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function LibraryDialog({
  siteId,
  siteUrl,
  current,
  onClose,
  onPick,
}: {
  siteId: string;
  siteUrl: string | null;
  current: Image[];
  onClose: () => void;
  onPick: (images: Image[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Always fresh: a photo uploaded a moment ago on another page should be here.
  const { data, isLoading, error } = useQuery({ queryKey: ["media", siteId], queryFn: () => api.mediaLibrary(siteId), staleTime: 0 });
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const have = useMemo(() => new Set(current.map((i) => i.url)), [current]);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const images = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.images ?? []).filter(
      (i) => !needle || [i.name, i.alternativeText, ...i.usedIn].some((t) => t?.toLowerCase().includes(needle)),
    );
  }, [data, search]);

  const toggle = (url: string) => setChosen((c) => (c.includes(url) ? c.filter((u) => u !== url) : [...c, url]));
  const add = () => {
    const byUrl = new Map((data?.images ?? []).map((i) => [i.url, i]));
    // In the order they were ticked; without the library-only `usedIn`.
    onPick(
      chosen
        .map((url) => byUrl.get(url))
        .filter((i): i is LibraryImage => Boolean(i))
        .map(({ usedIn: _usedIn, ...image }) => image),
    );
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-3xl flex-col rounded-xl p-0 shadow-xl backdrop:bg-black/40"
      aria-label="Choose photos"
    >
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
        <h2 className="flex-1 text-lg font-semibold">Choose photos</h2>
        <Button variant="ghost" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </Button>
      </header>
      <div className="border-b border-stone-100 px-4 py-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
          <TextInput
            type="search"
            placeholder="Search by artwork or file name"
            aria-label="Search photos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <Alert>{errorMessage(error)}</Alert>
        ) : images.length === 0 ? (
          <Alert kind="info">{search ? "No photos match your search." : "No photos uploaded yet."}</Alert>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image) => {
              const added = have.has(image.url);
              const picked = chosen.includes(image.url);
              const order = chosen.indexOf(image.url) + 1;
              return (
                <li key={image.url}>
                  <button
                    type="button"
                    disabled={added}
                    aria-pressed={picked}
                    onClick={() => toggle(image.url)}
                    className={`group block w-full overflow-hidden rounded-lg border-2 text-left transition ${
                      picked ? "border-stone-900" : "border-transparent hover:border-stone-300"
                    } disabled:cursor-default disabled:opacity-50`}
                  >
                    <div className="relative aspect-square bg-stone-100">
                      <img src={previewUrl(image.url, siteUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {(picked || added) && (
                        <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
                          {added ? <Check size={14} /> : order}
                        </span>
                      )}
                    </div>
                    <p className="truncate px-1.5 pt-1 text-xs text-stone-700">
                      {added ? "Already added" : image.usedIn.length ? image.usedIn.join(", ") : "Not used yet"}
                    </p>
                    {image.name && <p className="truncate px-1.5 pb-1 text-[11px] text-stone-400">{image.name}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <span className="text-sm text-stone-600">{chosen.length ? `${chosen.length} selected` : "Tap photos to select them"}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} disabled={chosen.length === 0}>
            Add {chosen.length > 1 ? `${chosen.length} photos` : "photo"}
          </Button>
        </div>
      </footer>
    </dialog>
  );
}

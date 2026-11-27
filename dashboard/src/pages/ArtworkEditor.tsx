import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2 } from "lucide-react";
import { api, type Artwork, type ArtworkInput, type ArtworkList, type Image } from "../api";
import { useSite } from "../session";
import { prepareImage, previewUrl, slugify } from "../lib/images";
import { RichTextEditor } from "../components/RichTextEditor";
import { StoreCard } from "../components/StoreCard";
import { useTerms } from "../lib/terms";
import { ImageLibraryButton } from "../components/ImageLibrary";
import { PaintingPrints } from "./Prints";
import { useToast } from "../components/Toast";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
  errorMessage,
} from "../components/ui";

type Status = "" | "available" | "sold" | "unavailable";

interface Draft {
  slug: string;
  title: string;
  description: string;
  category: string;
  material: string;
  dateCreated: string;
  width: string;
  height: string;
  images: Image[];
  tabs: { key: number; title: string; body: string }[];
  status: Status;
  price: string;
  label: string;
  collections: string[];
}

let nextTabKey = 1;

function toDraft(artwork: Artwork | null, list: ArtworkList): Draft {
  if (!artwork) {
    return {
      slug: "",
      title: "",
      description: "",
      category: list.categories[0] ?? "",
      material: "",
      dateCreated: String(new Date().getFullYear()),
      width: "",
      height: "",
      images: [],
      tabs: [{ key: nextTabKey++, title: "Details", body: "" }],
      status: "",
      price: "",
      label: "",
      // New artworks go in the main gallery by default.
      collections: list.collections.filter((c) => c.curated && c.id === "gallery").map((c) => c.id),
    };
  }
  return {
    slug: artwork.slug,
    title: artwork.title ?? "",
    description: artwork.description ?? "",
    category: artwork.category ?? "",
    material: artwork.material ?? "",
    dateCreated: artwork.dateCreated ?? "",
    width: artwork.size ? String(artwork.size.width) : "",
    height: artwork.size ? String(artwork.size.height) : "",
    images: artwork.images ?? [],
    tabs: (artwork.tabs ?? []).map((t) => ({ key: nextTabKey++, ...t })),
    status: artwork.availability?.status ?? "",
    price: artwork.availability?.price ?? "",
    label: artwork.availability?.label ?? "",
    collections: list.collections.filter((c) => c.curated && c.productSlugs.includes(artwork.slug)).map((c) => c.id),
  };
}

function toInput(d: Draft): ArtworkInput {
  return {
    title: d.title,
    description: d.description,
    category: d.category,
    material: d.material || undefined,
    dateCreated: d.dateCreated || undefined,
    size: parseSize(d.width, d.height),
    images: d.images,
    tabs: d.tabs.map(({ title, body }) => ({ title, body })),
    availability: d.status ? { status: d.status, price: d.price || undefined, label: d.label || undefined } : undefined,
  };
}

/** "36 x 48 in" written in the description or a tab → { width: 36, height: 48 }. */
function findSize(texts: string[]): { width: string; height: string } | null {
  for (const text of texts) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?\b)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?\b)/i);
    if (m && Number(m[1]) > 0 && Number(m[2]) > 0) return { width: m[1], height: m[2] };
  }
  return null;
}

/** Both sides typed → the size; otherwise none. */
function parseSize(width: string, height: string): { width: number; height: number } | undefined {
  const w = Number(width);
  const h = Number(height);
  return width.trim() && height.trim() && w > 0 && h > 0 ? { width: w, height: h } : undefined;
}

/** Comparable form of a draft (ignores React-only tab keys). */
function snapshot(d: Draft): string {
  return JSON.stringify({ ...d, tabs: d.tabs.map(({ title, body }) => ({ title, body })) });
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function ArtworkEditor() {
  const { slug } = useParams();
  const isNew = !slug;
  const { site } = useSite();
  const { data: list, isLoading, error } = useQuery({ queryKey: ["artworks", site.id], queryFn: () => api.artworks(site.id) });
  const artwork = list?.artworks.find((a) => a.slug === slug) ?? null;
  const terms = useTerms();

  if (isLoading) return <Spinner />;
  if (error || !list) return <Alert>{errorMessage(error)}</Alert>;
  if (!isNew && !artwork) {
    return (
      <div className="space-y-4">
        <Alert>That {terms.item} doesn't exist (it may have been deleted).</Alert>
        <Link to="/gallery" className="text-sm underline">
          Back to {terms.isArt ? "the gallery" : terms.items}
        </Link>
      </div>
    );
  }
  return <ArtworkForm key={slug ?? "new"} artwork={artwork} list={list} />;
}

function ArtworkForm({ artwork, list }: { artwork: Artwork | null; list: ArtworkList }) {
  const isNew = artwork === null;
  const { site } = useSite();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(artwork, list));
  const terms = useTerms();
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const toast = useToast();
  const failWith = (text: string) => {
    setErrorText(text);
    toast.error(text);
  };
  const [storePending, setStorePending] = useState(false);
  const storeSubmit = useRef<(() => Promise<boolean>) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const initial = useRef(snapshot(draft));

  const update = (patch: Partial<Draft>) => {
    setSavedText(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const dirty = snapshot(draft) !== initial.current;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const curated = list.collections.filter((c) => c.curated);
  const foundSize = findSize([draft.description, ...draft.tabs.map((t) => t.body)]);

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setErrorText(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blob, name } = await prepareImage(file);
        const uploaded = await api.uploadImage(site.id, blob, name);
        const alt = draft.title ? draft.title : "";
        setDraft((d) => ({ ...d, images: [...d.images, { ...uploaded, alternativeText: alt || undefined }] }));
      } catch (e) {
        failWith(errorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = async () => {
    setErrorText(null);
    setSavedText(null);
    if (!draft.title.trim()) return failWith(`Give the ${terms.item} a title.`);
    if (draft.images.length === 0) return failWith("Add at least one photo.");
    if (!draft.category.trim()) return failWith("Choose a category.");
    if (Boolean(draft.width.trim()) !== Boolean(draft.height.trim()) || (draft.width.trim() && !parseSize(draft.width, draft.height))) {
      return failWith("Enter both the width and the height of the painting in inches (like 36 and 48), or leave both empty.");
    }
    if (isNew && !draft.slug) return failWith("Choose a web address.");
    setSaving(true);
    try {
      // The item first, then (artworks) the original's availability.
      if (isNew || dirty) {
        if (isNew) {
          await api.createArtwork(site.id, draft.slug, toInput(draft), draft.collections);
        } else {
          await api.updateArtwork(site.id, draft.slug, toInput(draft), draft.collections);
        }
        await queryClient.invalidateQueries({ queryKey: ["artworks", site.id] });
        await queryClient.invalidateQueries({ queryKey: ["documents", site.id] });
      }
      if (isNew) {
        toast.success(`${terms.Item} created.`);
        navigate(`/gallery/${draft.slug}`, { replace: true });
      } else {
        initial.current = snapshot(draft);
        let storeUpdated = false;
        if (storePending && storeSubmit.current) {
          const storeOk = await storeSubmit.current();
          if (!storeOk) return failWith(`The ${terms.item} was saved, but the Original section needs attention (see above).`);
          storeUpdated = true;
        }
        setSavedText("Saved. Changes appear on the website within about a minute.");
        toast.success(storeUpdated ? "Saved, and the original's availability is updated." : "Saved. Changes appear on the website within about a minute.");
      }
    } catch (e) {
      failWith(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteArtwork(site.id, draft.slug);
      await queryClient.invalidateQueries({ queryKey: ["artworks", site.id] });
      await queryClient.invalidateQueries({ queryKey: ["documents", site.id] });
      toast.success(`${terms.Item} deleted.`);
      navigate("/gallery", { replace: true });
    } catch (e) {
      setConfirmDelete(false);
      failWith(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="pb-4">
      <Link to="/gallery" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} /> {terms.isArt ? "Gallery" : terms.Items}
      </Link>
      <PageHeader
        title={isNew ? `New ${terms.item}` : draft.title || "Untitled"}
        actions={
          !isNew && site.url ? (
            <a
              href={`${site.url.replace(/\/+$/, "")}/products/${draft.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-stone-600 underline-offset-2 hover:underline"
            >
              View on website
            </a>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <Card title="Photos" description="The first photo is the main one. Photos are resized and location data is removed before upload.">
          {draft.images.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {draft.images.map((image, i) => (
                <li key={image.url + i} className="space-y-2 rounded-lg border border-stone-200 p-2">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-stone-100">
                    <img src={previewUrl(image.url, site.url)} alt="" className="h-full w-full object-contain" />
                    {i === 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">Main</span>
                    )}
                  </div>
                  <Field label="Image description (for screen readers)">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={image.alternativeText ?? ""}
                        onChange={(e) =>
                          update({ images: draft.images.map((img, j) => (j === i ? { ...img, alternativeText: e.target.value } : img)) })
                        }
                      />
                    )}
                  </Field>
                  <div className="flex justify-between gap-1">
                    <div className="flex gap-1">
                      <Button variant="ghost" aria-label="Move earlier" title="Move earlier" disabled={i === 0} onClick={() => update({ images: move(draft.images, i, i - 1) })}>
                        <ChevronLeft size={18} />
                      </Button>
                      <Button variant="ghost" aria-label="Move later" title="Move later" disabled={i === draft.images.length - 1} onClick={() => update({ images: move(draft.images, i, i + 1) })}>
                        <ChevronRight size={18} />
                      </Button>
                    </div>
                    <Button variant="ghost" className="text-red-700" onClick={() => update({ images: draft.images.filter((_, j) => j !== i) })}>
                      <Trash2 size={16} /> Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            onChange={(e) => addImages(e.target.files)}
            id="artwork-photos"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={uploading > 0} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={18} /> {uploading > 0 ? "Uploading…" : "Upload new"}
            </Button>
            <ImageLibraryButton
              siteId={site.id}
              siteUrl={site.url}
              current={draft.images}
              onPick={(picked) => update({ images: [...draft.images, ...picked.map((i) => ({ ...i, alternativeText: i.alternativeText ?? (draft.title || undefined) }))] })}
            />
          </div>
        </Card>

        <Card title="Details">
          <Field label="Title">
            {(id) => (
              <TextInput
                id={id}
                value={draft.title}
                onChange={(e) => update({ title: e.target.value, ...(isNew && !slugTouched ? { slug: slugify(e.target.value) } : {}) })}
              />
            )}
          </Field>
          {isNew && (
            <Field label="Web address" hint={`The ${terms.item}'s page will be ${site.url ?? ""}/products/${draft.slug || "…"}. This can't be changed later.`}>
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    update({ slug: slugify(e.target.value) });
                  }}
                />
              )}
            </Field>
          )}
          <Field label="Short description" hint="Shown in listings and link previews.">
            {(id) => <TextArea id={id} value={draft.description} onChange={(e) => update({ description: e.target.value })} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Category">
              {(id) => (
                <>
                  <TextInput id={id} list="categories" value={draft.category} onChange={(e) => update({ category: slugify(e.target.value) })} />
                  <datalist id="categories">
                    {list.categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Material">
              {(id) => <TextInput id={id} placeholder="Oil on canvas" value={draft.material} onChange={(e) => update({ material: e.target.value })} />}
            </Field>
            <Field label="Year">
              {(id) => <TextInput id={id} inputMode="numeric" value={draft.dateCreated} onChange={(e) => update({ dateCreated: e.target.value })} />}
            </Field>
          </div>
          {terms.isArt && <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Width (inches)" hint="The painting's own size.">
              {(id) => <TextInput id={id} inputMode="decimal" placeholder="36" value={draft.width} onChange={(e) => update({ width: e.target.value })} />}
            </Field>
            <Field label="Height (inches)">
              {(id) => <TextInput id={id} inputMode="decimal" placeholder="48" value={draft.height} onChange={(e) => update({ height: e.target.value })} />}
            </Field>
          </div>}
          {terms.isArt && !draft.width.trim() && !draft.height.trim() && foundSize && (
            <div>
              <Button variant="secondary" onClick={() => update({ width: foundSize.width, height: foundSize.height })}>
                Use {foundSize.width} x {foundSize.height} in (from the description)
              </Button>
            </div>
          )}
        </Card>

        <Card title="Availability">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Status">
              {(id) => (
                <Select id={id} value={draft.status} onChange={(e) => update({ status: e.target.value as Status })}>
                  <option value="">Not shown</option>
                  <option value="available">Available</option>
                  <option value="sold">Sold</option>
                  <option value="unavailable">Unavailable</option>
                </Select>
              )}
            </Field>
            {draft.status === "available" && (
              <Field label="Price" hint="Optional, e.g. $850">
                {(id) => <TextInput id={id} value={draft.price} onChange={(e) => update({ price: e.target.value })} />}
              </Field>
            )}
            {draft.status === "unavailable" && (
              <Field label="Note" hint="e.g. Personal collection">
                {(id) => <TextInput id={id} value={draft.label} onChange={(e) => update({ label: e.target.value })} />}
              </Field>
            )}
          </div>
        </Card>

        <Card title="Description sections" description={`Each section is a tab on the ${terms.item}'s page.`}>
          {draft.tabs.map((tab, i) => (
            <div key={tab.key} className="space-y-3 rounded-lg border border-stone-200 p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={`Section ${i + 1} title`}>
                    {(id) => (
                      <TextInput
                        id={id}
                        value={tab.title}
                        onChange={(e) => update({ tabs: draft.tabs.map((t, j) => (j === i ? { ...t, title: e.target.value } : t)) })}
                      />
                    )}
                  </Field>
                </div>
                <Button variant="ghost" aria-label="Move section up" title="Move up" disabled={i === 0} onClick={() => update({ tabs: move(draft.tabs, i, i - 1) })}>
                  <ArrowUp size={18} />
                </Button>
                <Button variant="ghost" aria-label="Move section down" title="Move down" disabled={i === draft.tabs.length - 1} onClick={() => update({ tabs: move(draft.tabs, i, i + 1) })}>
                  <ArrowDown size={18} />
                </Button>
                <Button variant="ghost" aria-label="Remove section" title="Remove section" className="text-red-700" onClick={() => update({ tabs: draft.tabs.filter((_, j) => j !== i) })}>
                  <Trash2 size={18} />
                </Button>
              </div>
              <RichTextEditor
                value={tab.body}
                onChange={(body) => setDraft((d) => ({ ...d, tabs: d.tabs.map((t) => (t.key === tab.key ? { ...t, body } : t)) }))}
              />
            </div>
          ))}
          <Button variant="secondary" onClick={() => update({ tabs: [...draft.tabs, { key: nextTabKey++, title: "", body: "" }] })}>
            <Plus size={18} /> Add section
          </Button>
        </Card>

{!terms.isArt ? null : artwork ? (
          <>
            <StoreCard siteId={site.id} artwork={artwork} submitRef={storeSubmit} onPendingChange={setStorePending} />
            {terms.prints && <PaintingPrints siteId={site.id} painting={artwork.slug} />}
          </>
        ) : (
          <Card title="Original and prints">
            <p className="text-sm text-stone-500">Create the artwork first, then you can offer the original and create prints of it.</p>
          </Card>
        )}

        {curated.length > 0 && (
          <Card title="Show in" description={`Which lists on the website include this ${terms.item}. New additions appear first.`}>
            <div className="space-y-1">
              {curated.map((c) => (
                <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-stone-50">
                  <input
                    type="checkbox"
                    className="size-5 accent-stone-900"
                    checked={draft.collections.includes(c.id)}
                    onChange={(e) =>
                      update({
                        collections: e.target.checked ? [...draft.collections, c.id] : draft.collections.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <span className="text-sm text-stone-800">{c.title || c.id}</span>
                </label>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-stone-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        {errorText && (
          <div className="mb-3">
            <Alert>{errorText}</Alert>
          </div>
        )}
        {savedText && !dirty && !storePending && (
          <div className="mb-3">
            <Alert kind="success">{savedText}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isNew ? (
            <Button variant="ghost" className="text-red-700" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/gallery")}>
              {dirty || storePending ? "Cancel" : "Done"}
            </Button>
            <Button onClick={save} busy={saving} disabled={uploading > 0 || (!dirty && !storePending && !isNew)}>
              {isNew ? `Create ${terms.item}` : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${terms.item}?`}
        body={<>“{draft.title}” will be removed from the website. This can't be undone.</>}
        confirmLabel={`Delete ${terms.item}`}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

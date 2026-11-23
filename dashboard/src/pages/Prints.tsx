import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, ImageOff, ImagePlus, Plus, Trash2 } from "lucide-react";
import { api, type Artwork, type Image, type Print, type PrintInput } from "../api";
import { useSite } from "../session";
import { prepareImage, previewUrl, slugify } from "../lib/images";
import { centsToInput, formatMoney, parseDollars } from "../lib/money";
import { RichTextEditor } from "../components/RichTextEditor";
import { ImageLibraryButton } from "../components/ImageLibrary";
import { useToast } from "../components/Toast";
import { Alert, Button, Card, ConfirmDialog, Field, PageHeader, Select, Spinner, TextInput, errorMessage } from "../components/ui";
import { TextEditor } from "./TextEditor";

/** "24 x 36" (drops trailing .0). */
function sizeLabel(size: { width: number; height: number }): string {
  const n = (v: number) => String(parseFloat(v.toFixed(2)));
  return `${n(size.width)} x ${n(size.height)}`;
}

/** "Mount Pleasant | Archival Limited Edition 24 x 36": how the website names a print. */
function printName(print: { title: string; size: { width: number; height: number } }, paintingTitle: string): string {
  return `${paintingTitle} | ${print.title} ${sizeLabel(print.size)}`;
}

function usePrintsAndArtworks() {
  const { site } = useSite();
  const prints = useQuery({ queryKey: ["prints", site.id], queryFn: () => api.prints(site.id) });
  const artworks = useQuery({ queryKey: ["artworks", site.id], queryFn: () => api.artworks(site.id) });
  return { prints, artworks };
}

function StatusBadge({ print }: { print: Print }) {
  if (!print.forSale) return <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">Hidden</span>;
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">For sale</span>;
}

function PrintRow({ print, painting, currency }: { print: Print; painting?: Artwork; currency: string }) {
  const { site } = useSite();
  const image = print.images[0] ?? painting?.images?.[0];
  return (
    <Link
      to={`/prints/${print.slug}`}
      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2 pr-4 shadow-sm transition hover:border-stone-400"
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {image ? (
          <img src={previewUrl(image.url, site.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <ImageOff size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">{printName(print, painting?.title ?? "Missing painting")}</p>
        <p className="text-sm text-stone-600">
          {formatMoney(print.priceCents, currency)}
          {print.editionSize ? ` · ${print.editionSize} copies` : " · Open edition"}
        </p>
      </div>
      <StatusBadge print={print} />
    </Link>
  );
}

function PrintList() {
  const { prints, artworks } = usePrintsAndArtworks();
  if (prints.isLoading || artworks.isLoading) return <Spinner />;
  if (!prints.data || !artworks.data) return <Alert>{errorMessage(prints.error ?? artworks.error)}</Alert>;
  const bySlug = new Map(artworks.data.artworks.map((a) => [a.slug, a]));
  const sorted = [...prints.data.prints].sort(
    (a, b) => (bySlug.get(a.painting)?.title ?? "").localeCompare(bySlug.get(b.painting)?.title ?? "") || a.priceCents - b.priceCents,
  );
  if (sorted.length === 0) return <Alert kind="info">No prints yet. Create one and choose which painting it's of.</Alert>;
  return (
    <div className="space-y-2">
      {sorted.map((p) => (
        <PrintRow key={p.slug} print={p} painting={bySlug.get(p.painting)} currency={prints.data.currency} />
      ))}
    </div>
  );
}

export function Prints() {
  const { site } = useSite();
  const [tab, setTab] = useState<"prints" | "text">("prints");
  const { data: docs } = useQuery({ queryKey: ["documents", site.id], queryFn: () => api.documents(site.id) });
  const hasPage = (docs ?? []).some((d) => d.type === "page" && d.key === "prints");
  return (
    <div>
      <PageHeader
        title="Prints"
        description="Each print is its own listing on the website's Prints page, linked to one painting."
        actions={
          tab === "prints" && (
            <Link
              to="/prints/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700"
            >
              <Plus size={18} /> New print
            </Link>
          )
        }
      />
      {hasPage && (
        <div className="mb-5 inline-flex rounded-lg border border-stone-200 bg-white p-1" role="tablist">
          {(
            [
              ["prints", "Prints"],
              ["text", "Page text"],
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
      )}
      {tab === "prints" ? (
        <PrintList />
      ) : (
        <TextEditor key={`${site.id}/prints`} refs={[{ type: "page", key: "prints", title: "Prints page" }]} />
      )}
    </div>
  );
}

/** On an artwork's page in the dashboard: its prints, and a shortcut to make another. */
export function PaintingPrints({ siteId, painting }: { siteId: string; painting: string }) {
  const { prints, artworks } = usePrintsAndArtworks();
  const mine = (prints.data?.prints ?? []).filter((p) => p.painting === painting);
  const artwork = artworks.data?.artworks.find((a) => a.slug === painting);
  return (
    <Card
      title="Prints"
      description="Prints of this painting. They're listed on the website's Prints page and linked from this artwork."
      actions={
        <Link to={`/prints/new?painting=${encodeURIComponent(painting)}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-stone-900 underline-offset-2 hover:underline">
          <Plus size={16} /> New print
        </Link>
      }
    >
      {prints.isLoading ? (
        <Spinner />
      ) : mine.length === 0 ? (
        <p className="text-sm text-stone-500">No prints of this painting yet.</p>
      ) : (
        <div className="space-y-2">
          {mine.map((p) => (
            <PrintRow key={`${siteId}/${p.slug}`} print={p} painting={artwork} currency={prints.data?.currency ?? "CAD"} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ editor

interface Draft {
  slug: string;
  painting: string;
  title: string;
  width: string;
  height: string;
  edition: string;
  price: string;
  description: string;
  images: Image[];
  forSale: boolean;
}

const TITLE_IDEAS = ["Archival Limited Edition", "Open Edition", "Giclée Print", "Canvas Print", "Signed Print"];

function toDraft(print: Print | null, painting: string, artworks: Artwork[]): Draft {
  if (!print) {
    const size = artworks.find((a) => a.slug === painting)?.size;
    return {
      slug: "",
      painting,
      title: "",
      width: size ? String(size.width) : "",
      height: size ? String(size.height) : "",
      edition: "",
      price: "",
      description: "",
      images: [],
      forSale: true,
    };
  }
  return {
    slug: print.slug,
    painting: print.painting,
    title: print.title,
    width: String(print.size.width),
    height: String(print.size.height),
    edition: print.editionSize ? String(print.editionSize) : "",
    price: centsToInput(print.priceCents),
    description: print.description ?? "",
    images: print.images ?? [],
    forSale: print.forSale,
  };
}

function suggestedSlug(d: Draft): string {
  const size = d.width && d.height ? `${d.width}x${d.height}` : "";
  return slugify([d.painting, d.title, size].filter(Boolean).join(" "));
}

export function PrintEditor() {
  const { slug } = useParams();
  const [search] = useSearchParams();
  const { prints, artworks } = usePrintsAndArtworks();
  if (prints.isLoading || artworks.isLoading) return <Spinner />;
  if (!prints.data || !artworks.data) return <Alert>{errorMessage(prints.error ?? artworks.error)}</Alert>;
  const print = slug ? (prints.data.prints.find((p) => p.slug === slug) ?? null) : null;
  if (slug && !print) {
    return (
      <div className="space-y-4">
        <Alert>That print doesn't exist (it may have been deleted).</Alert>
        <Link to="/prints" className="text-sm underline">
          Back to prints
        </Link>
      </div>
    );
  }
  return (
    <PrintForm
      key={slug ?? "new"}
      print={print}
      startPainting={search.get("painting") ?? ""}
      artworks={artworks.data.artworks}
      currency={prints.data.currency}
      stripeConfigured={prints.data.stripeConfigured}
      stripeTestMode={prints.data.stripeTestMode}
    />
  );
}

function PrintForm({
  print,
  startPainting,
  artworks,
  currency,
  stripeConfigured,
  stripeTestMode,
}: {
  print: Print | null;
  startPainting: string;
  artworks: Artwork[];
  currency: string;
  stripeConfigured: boolean;
  stripeTestMode: boolean;
}) {
  const isNew = print === null;
  const { site } = useSite();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(print, startPainting, artworks));
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const initial = useRef(JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== initial.current;

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      return isNew && !slugTouched ? { ...next, slug: suggestedSlug(next) } : next;
    });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // A painting chosen from the artwork page fills the size and web address.
  useEffect(() => {
    if (isNew && startPainting) update({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paintings = useMemo(() => [...artworks].sort((a, b) => a.title.localeCompare(b.title)), [artworks]);
  const painting = artworks.find((a) => a.slug === draft.painting);
  const fail = (text: string) => {
    setErrorText(text);
    toast.error(text);
  };

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setErrorText(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blob, name } = await prepareImage(file);
        const uploaded = await api.uploadImage(site.id, blob, name);
        setDraft((d) => ({ ...d, images: [...d.images, { ...uploaded, alternativeText: painting ? `${painting.title} print` : undefined }] }));
      } catch (e) {
        fail(errorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const toInput = (): PrintInput | string => {
    if (!draft.painting) return "Choose which painting this print is of.";
    if (!draft.title.trim()) return "Give the print a name, like “Archival Limited Edition”.";
    const width = Number(draft.width);
    const height = Number(draft.height);
    if (!(width > 0 && height > 0)) return "Enter the print's width and height in inches.";
    const priceCents = parseDollars(draft.price);
    if (priceCents === null || priceCents < 100) return "Enter a price of at least $1, like 180.";
    let editionSize: number | undefined;
    if (draft.edition.trim()) {
      editionSize = Number(draft.edition);
      if (!Number.isInteger(editionSize) || editionSize < 1) return "The number of copies must be a whole number, or leave it empty for an open edition.";
    }
    return { painting: draft.painting, title: draft.title.trim(), size: { width, height }, editionSize, priceCents, description: draft.description, images: draft.images, forSale: draft.forSale };
  };

  const save = async () => {
    setErrorText(null);
    const input = toInput();
    if (typeof input === "string") return fail(input);
    if (isNew && !draft.slug) return fail("Choose a web address.");
    setSaving(true);
    try {
      const { note } = isNew ? await api.createPrint(site.id, draft.slug, input) : await api.updatePrint(site.id, draft.slug, input);
      await queryClient.invalidateQueries({ queryKey: ["prints", site.id] });
      initial.current = JSON.stringify(draft);
      if (note) toast.success(note);
      else toast.success(isNew ? "Print created. It's on the website's Prints page within about a minute." : "Saved.");
      if (isNew) navigate(`/prints/${draft.slug}`, { replace: true });
    } catch (e) {
      fail(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deletePrint(site.id, draft.slug);
      await queryClient.invalidateQueries({ queryKey: ["prints", site.id] });
      toast.success("Print deleted.");
      navigate("/prints", { replace: true });
    } catch (e) {
      setConfirmDelete(false);
      fail(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const previewName = painting && draft.title.trim() && Number(draft.width) > 0 && Number(draft.height) > 0
    ? printName({ title: draft.title.trim(), size: { width: Number(draft.width), height: Number(draft.height) } }, painting.title)
    : null;
  const siteUrl = site.url?.replace(/\/+$/, "") ?? "";

  return (
    <div className="pb-4">
      <Link to="/prints" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft size={16} /> Prints
      </Link>
      <PageHeader
        title={isNew ? "New print" : (previewName ?? "Print")}
        actions={
          !isNew && siteUrl ? (
            <a href={`${siteUrl}/prints/${draft.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-stone-600 underline-offset-2 hover:underline">
              View on website
            </a>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {stripeTestMode ? (
          <Alert kind="info">Test mode: Stripe isn't connected on this computer, so the website shows Inquire instead of Buy.</Alert>
        ) : (
          !stripeConfigured && (
            <Alert kind="info">Stripe isn't connected for this site yet. Prints still show on the website, with an Inquire button instead of Buy.</Alert>
          )
        )}

        <Card title="Print">
          <Field label="Painting" hint="The painting this is a print of. Its page links to this print.">
            {(id) => (
              <Select id={id} value={draft.painting} onChange={(e) => {
                const size = artworks.find((a) => a.slug === e.target.value)?.size;
                update({ painting: e.target.value, ...(isNew && size && !draft.width && !draft.height ? { width: String(size.width), height: String(size.height) } : {}) });
              }}>
                <option value="">Choose a painting…</option>
                {paintings.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Name" hint="e.g. Archival Limited Edition, Open Edition.">
            {(id) => (
              <>
                <TextInput id={id} list="print-titles" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
                <datalist id="print-titles">
                  {TITLE_IDEAS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Field label="Width (inches)">
              {(id) => <TextInput id={id} inputMode="decimal" placeholder="24" value={draft.width} onChange={(e) => update({ width: e.target.value })} />}
            </Field>
            <Field label="Height (inches)">
              {(id) => <TextInput id={id} inputMode="decimal" placeholder="36" value={draft.height} onChange={(e) => update({ height: e.target.value })} />}
            </Field>
            <Field label={`Price (${currency})`}>
              {(id) => <TextInput id={id} inputMode="decimal" placeholder="180" value={draft.price} onChange={(e) => update({ price: e.target.value })} />}
            </Field>
            <Field label="Copies" hint="Empty = open edition.">
              {(id) => <TextInput id={id} inputMode="numeric" placeholder="15" value={draft.edition} onChange={(e) => update({ edition: e.target.value })} />}
            </Field>
          </div>
          {previewName && (
            <p className="text-sm text-stone-600">
              Shown on the website as <span className="font-medium text-stone-900">{previewName}</span>
              {draft.edition.trim() ? `, ${draft.edition.trim()} copies` : ""}.
            </p>
          )}
          {isNew && (
            <Field label="Web address" hint={`The print's page will be ${siteUrl}/prints/${draft.slug || "…"}. This can't be changed later.`}>
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraft((d) => ({ ...d, slug: slugify(e.target.value) }));
                  }}
                />
              )}
            </Field>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-stone-50">
            <input type="checkbox" className="size-5 accent-stone-900" checked={draft.forSale} onChange={(e) => update({ forSale: e.target.checked })} />
            <span className="text-sm text-stone-800">For sale (shown on the website)</span>
          </label>
        </Card>

        <Card title="Description" description="Shown on the print's page: paper, printing, signing, shipping…">
          <RichTextEditor value={draft.description} onChange={(description) => setDraft((d) => ({ ...d, description }))} />
        </Card>

        <Card title="Photos" description="Optional, e.g. mockups of the print on a wall. Without photos, the painting's photo is used.">
          {draft.images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draft.images.map((image, i) => (
                <li key={image.url + i} className="space-y-1 rounded-lg border border-stone-200 p-2">
                  <div className="relative aspect-square overflow-hidden rounded-md bg-stone-100">
                    <img src={previewUrl(image.url, site.url)} alt="" className="h-full w-full object-contain" />
                    {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">Main</span>}
                  </div>
                  <div className="flex justify-between">
                    <div className="flex">
                      <Button variant="ghost" aria-label="Move earlier" disabled={i === 0} onClick={() => update({ images: swap(draft.images, i, i - 1) })}>
                        <ChevronLeft size={18} />
                      </Button>
                      <Button variant="ghost" aria-label="Move later" disabled={i === draft.images.length - 1} onClick={() => update({ images: swap(draft.images, i, i + 1) })}>
                        <ChevronRight size={18} />
                      </Button>
                    </div>
                    <Button variant="ghost" aria-label="Remove photo" className="text-red-700" onClick={() => update({ images: draft.images.filter((_, j) => j !== i) })}>
                      <Trash2 size={16} />
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
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={uploading > 0} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={18} /> {uploading > 0 ? "Uploading…" : "Upload new"}
            </Button>
            <ImageLibraryButton
              siteId={site.id}
              siteUrl={site.url}
              current={draft.images}
              onPick={(picked) => update({ images: [...draft.images, ...picked] })}
            />
          </div>
        </Card>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-stone-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        {errorText && (
          <div className="mb-3">
            <Alert>{errorText}</Alert>
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
            <Button variant="secondary" onClick={() => navigate("/prints")}>
              {dirty ? "Cancel" : "Done"}
            </Button>
            <Button onClick={save} busy={saving} disabled={uploading > 0 || (!dirty && !isNew)}>
              {isNew ? "Create print" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this print?"
        body={<>It will be removed from the website and can no longer be bought. This can't be undone.</>}
        confirmLabel="Delete print"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function swap<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

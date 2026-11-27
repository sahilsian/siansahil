// Client for the server's dashboard API (same origin, cookie session).
// Every request carries X-Dashboard-Request: the server refuses state-changing
// requests without it, which blocks cross-site forms and scripts.

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const BASE = "/api/v1/dashboard";

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const headers: Record<string, string> = { "X-Dashboard-Request": "1", Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (raw) {
    headers["Content-Type"] = "application/octet-stream";
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(BASE + path, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "Couldn't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.message ??
      (response.status === 413 ? "That file is too large." : `Something went wrong (error ${response.status}).`);
    throw new ApiError(response.status, data?.error ?? "error", message);
  }
  return data as T;
}

// ------------------------------------------------------------------ types

export type Role = "superadmin" | "editor";

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  tenantId: string | null;
}

export interface Site {
  id: string;
  name: string | null;
  url: string | null;
  /** What this site's gallery items are called (site.json `terms`); default artwork/artworks. */
  terms?: { item?: string; items?: string } | null;
  /** Sections this site uses (site.json `features`); default all on. */
  features?: { prints?: boolean } | null;
}

export interface Me {
  user: User;
  sites: Site[];
}

export type DocType = "site" | "page" | "product" | "collection" | "form" | "print";

export interface DocumentMeta {
  type: DocType;
  key: string;
  version: number;
  updatedAt: string;
}

export interface DocumentWithData extends DocumentMeta {
  data: Record<string, unknown>;
}

export interface Image {
  url: string;
  width: number;
  height: number;
  alternativeText?: string;
  name?: string;
}

/** An image already on the site: uploaded, or used on artworks/prints (their titles in `usedIn`). */
export interface LibraryImage extends Image {
  usedIn: string[];
}

export interface Availability {
  status: "available" | "sold" | "unavailable";
  price?: string;
  label?: string;
}

/** A stored artwork (product document). */
export interface Artwork {
  $type: "product";
  slug: string;
  title: string;
  description?: string;
  category: string;
  material?: string;
  dateCreated?: string;
  images: Image[];
  tabs: { title: string; body: string }[];
  availability?: Availability;
  /** The painting's own size, in inches. */
  size?: { width: number; height: number; unit: "in" };
  store?: ArtworkStore;
  [key: string]: unknown;
}

/** One thing for sale (a Stripe product with one price). */
export interface StoreItem {
  priceCents: number;
  stripeProductId: string;
  stripePriceId: string;
  active: boolean;
}

export interface ArtworkStore {
  currency: string;
  /** Visitors can inquire about the original (it has no price). */
  originalAvailable?: boolean;
  /** Only on artworks priced before the original became inquiry-only. */
  original: StoreItem | null;
  prints: (StoreItem & { sizeId: string; label: string })[];
}

export interface PrintSize {
  id: string;
  label: string;
  priceCents: number;
}

export interface StoreSettings {
  stripeConfigured: boolean;
  /** Local test mode: adding to the store makes up ids instead of calling Stripe. */
  stripeTestMode?: boolean;
  currency: string;
  printSizes: PrintSize[];
  /** Dollars per square inch for original-size prints. */
  originalSizeRate: number;
  /** Every painting with a size also offers a print at its own size. */
  originalSizePrints: boolean;
}

/** A print for sale: its own listing, linked to one painting. */
export interface Print {
  $type: "print";
  slug: string;
  /** The painting's slug. */
  painting: string;
  /** e.g. "Archival Limited Edition". */
  title: string;
  size: { width: number; height: number; unit: "in" };
  /** Copies in the edition; absent = open edition. */
  editionSize?: number;
  priceCents: number;
  currency?: string;
  description?: string;
  /** Mockups etc. Empty = the website uses the painting's photo. */
  images: Image[];
  forSale: boolean;
  stripe?: { active?: boolean; paymentLinkUrl?: string | null };
}

export interface PrintInput {
  painting: string;
  title: string;
  size: { width: number; height: number };
  editionSize?: number;
  priceCents: number;
  description: string;
  images: Image[];
  forSale: boolean;
}

export interface PrintList {
  prints: Print[];
  stripeConfigured: boolean;
  stripeTestMode: boolean;
  currency: string;
}

export interface Subscriber {
  email: string;
  subscribedAt: string;
}

/** What the dashboard sends when saving an artwork. */
export interface ArtworkInput {
  title: string;
  description: string;
  category: string;
  material?: string;
  dateCreated?: string;
  images: Image[];
  tabs: { title: string; body: string }[];
  availability?: Availability;
  size?: { width: number; height: number };
}

export interface CollectionInfo {
  id: string;
  title: string;
  curated: boolean;
  productSlugs: string[];
  category?: string;
}

export interface ArtworkList {
  artworks: Artwork[];
  collections: CollectionInfo[];
  categories: string[];
}

export interface UserListing {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  tenantId: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ endpoints

const site = (id: string) => `/sites/${encodeURIComponent(id)}`;

export const api = {
  login: (username: string, password: string) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout", {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    request("POST", "/auth/password", { currentPassword, newPassword }),
  me: () => request<Me>("GET", "/me"),

  documents: (siteId: string) => request<DocumentMeta[]>("GET", `${site(siteId)}/documents`),
  document: (siteId: string, type: DocType, key: string) =>
    request<DocumentWithData>("GET", `${site(siteId)}/documents/${type}/${encodeURIComponent(key)}`),
  saveDocument: (siteId: string, type: DocType, key: string, data: unknown, baseVersion: number) =>
    request<DocumentWithData>("PUT", `${site(siteId)}/documents/${type}/${encodeURIComponent(key)}`, {
      data,
      baseVersion,
    }),

  artworks: (siteId: string) => request<ArtworkList>("GET", `${site(siteId)}/artworks`),
  createArtwork: (siteId: string, slug: string, artwork: ArtworkInput, collections: string[]) =>
    request<{ artwork: Artwork }>("POST", `${site(siteId)}/artworks`, { slug, artwork, collections }),
  updateArtwork: (siteId: string, slug: string, artwork: ArtworkInput, collections: string[]) =>
    request<{ artwork: Artwork }>("PUT", `${site(siteId)}/artworks/${encodeURIComponent(slug)}`, {
      artwork,
      collections,
    }),
  deleteArtwork: (siteId: string, slug: string) =>
    request<void>("DELETE", `${site(siteId)}/artworks/${encodeURIComponent(slug)}`),
  mailingList: (siteId: string) => request<{ subscribers: Subscriber[] }>("GET", `${site(siteId)}/mailing-list`),
  addSubscribers: (siteId: string, emails: string[]) =>
    request<{ added: number; alreadySubscribed: number; invalid: string[] }>("POST", `${site(siteId)}/mailing-list/add`, { emails }),
  removeSubscriber: (siteId: string, email: string) =>
    request<void>("POST", `${site(siteId)}/mailing-list/remove`, { email }),

  storeSettings: (siteId: string) => request<StoreSettings>("GET", `${site(siteId)}/store`),
  saveStoreSettings: (
    siteId: string,
    printSizes: { id?: string; label: string; priceCents: number }[],
    originalSizeRate?: number,
    originalSizePrints?: boolean,
  ) => request<StoreSettings>("PUT", `${site(siteId)}/store`, { printSizes, originalSizeRate, originalSizePrints }),
  setOriginalAvailable: (siteId: string, slug: string, originalAvailable: boolean) =>
    request<{ store: ArtworkStore }>("PUT", `${site(siteId)}/artworks/${encodeURIComponent(slug)}/store`, {
      originalAvailable,
    }),

  prints: (siteId: string) => request<PrintList>("GET", `${site(siteId)}/prints`),
  createPrint: (siteId: string, slug: string, print: PrintInput) =>
    request<{ print: Print; note?: string | null }>("POST", `${site(siteId)}/prints`, { slug, print }),
  updatePrint: (siteId: string, slug: string, print: PrintInput) =>
    request<{ print: Print; note?: string | null }>("PUT", `${site(siteId)}/prints/${encodeURIComponent(slug)}`, { print }),
  deletePrint: (siteId: string, slug: string) =>
    request<void>("DELETE", `${site(siteId)}/prints/${encodeURIComponent(slug)}`),
  removeFromStore: (siteId: string, slug: string) =>
    request<{ store: ArtworkStore }>("DELETE", `${site(siteId)}/artworks/${encodeURIComponent(slug)}/store`),

  mediaLibrary: (siteId: string) => request<{ images: LibraryImage[] }>("GET", `${site(siteId)}/media`),
  uploadImage: (siteId: string, file: Blob, name: string) =>
    request<Image>("POST", `${site(siteId)}/media?name=${encodeURIComponent(name)}`, undefined, file),

  accounts: () => request<{ users: UserListing[] }>("GET", "/admin/accounts"),
  createUser: (username: string, password: string, siteId: string, email: string) =>
    request<{ user: User }>("POST", "/admin/users", { username, password, siteId, email: email || undefined }),
  resetPassword: (id: string, password: string) => request("PUT", `/admin/users/${id}/password`, { password }),
  removeUser: (id: string) => request<void>("DELETE", `/admin/users/${id}`),
};

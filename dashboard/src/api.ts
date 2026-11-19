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
}

export interface Me {
  user: User;
  sites: Site[];
}

export type DocType = "site" | "page" | "product" | "collection" | "form";

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
  [key: string]: unknown;
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
  uploadImage: (siteId: string, file: Blob, name: string) =>
    request<Image>("POST", `${site(siteId)}/media?name=${encodeURIComponent(name)}`, undefined, file),

  accounts: () => request<{ users: UserListing[] }>("GET", "/admin/accounts"),
  createUser: (username: string, password: string, siteId: string, email: string) =>
    request<{ user: User }>("POST", "/admin/users", { username, password, siteId, email: email || undefined }),
  resetPassword: (id: string, password: string) => request("PUT", `/admin/users/${id}/password`, { password }),
  removeUser: (id: string) => request<void>("DELETE", `/admin/users/${id}`),
};

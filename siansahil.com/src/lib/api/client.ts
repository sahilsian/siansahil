// HTTP client for the content server. Every head renders exactly one tenant,
// chosen at build time by VITE_TENANT_ID; all content comes from
// GET {VITE_CONTENT_API_URL}/api/v1/content/{tenantId}/...

import { notFound } from "@tanstack/react-router";

function config() {
    const env = (import.meta as any).env;
    const baseUrl = (env.VITE_CONTENT_API_URL as string | undefined)?.replace(/\/+$/, "");
    const tenantId = env.VITE_TENANT_ID as string | undefined;
    if (!baseUrl || !tenantId) {
        throw new Error("VITE_CONTENT_API_URL and VITE_TENANT_ID must be set for this head.");
    }
    return { baseUrl, tenantId };
}

/** A non-2xx response from the content server: `{ error, message }`. */
export class ContentApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "ContentApiError";
    }

    get isNotFound() {
        return this.status === 404;
    }
}

/** GET a tenant-scoped content path, e.g. `contentGet("/pages/about")`. */
export async function contentGet<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const { baseUrl, tenantId } = config();
    const url = new URL(`${baseUrl}/api/v1/content/${encodeURIComponent(tenantId)}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value) url.searchParams.set(key, value);
    }

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        // A missing page/product/etc. renders the site's 404 page. (An unknown
        // tenant is "tenant_not_found" and stays an error: that's misconfiguration.)
        if (body.error === "not_found") throw notFound();
        throw new ContentApiError(
            response.status,
            body.error ?? "unknown_error",
            body.message ?? `Content request failed (${response.status}) for ${path}`,
        );
    }
    return response.json() as Promise<T>;
}

/**
 * Add an address to this tenant's mailing list on the content server, which
 * stores it and emails the tenant a notification. Resolves true on success.
 */
export async function subscribeToMailingList(email: string): Promise<boolean> {
    const { baseUrl, tenantId } = config();
    const response = await fetch(`${baseUrl}/api/v1/mailing-list/${encodeURIComponent(tenantId)}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
    });
    return response.ok;
}

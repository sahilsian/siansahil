import type { pageSEO } from "@/components/seo/interfaces.ts";

/** Page-level `<head>` tags from a page's SEO. Missing SEO → no overrides (root defaults apply). */
export function pageHead(seo?: pageSEO) {
    if (!seo) return {};
    const meta: Record<string, string>[] = [];
    if (seo.title) {
        meta.push({ title: seo.title }, { property: "og:title", content: seo.title });
    }
    if (seo.description) {
        meta.push({ name: "description", content: seo.description }, { property: "og:description", content: seo.description });
    }
    if (seo.keywords) meta.push({ name: "keywords", content: seo.keywords });
    if (seo.robots) meta.push({ name: "robots", content: seo.robots });
    if (seo.OGImage?.url) meta.push({ property: "og:image", content: seo.OGImage.url });
    meta.push({ property: "og:type", content: "website" });

    return {
        meta,
        links: seo.canonical ? [{ rel: "canonical", href: seo.canonical }] : [],
    };
}

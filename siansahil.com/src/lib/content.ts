// Static content layer — replaces the old GraphQL/Strapi data layer
// (src/lib/data/gqlServerClient.ts, queries/*, fragments.ts, env.ts).
// All content is bundled at build time from src/data/*.json; there is no
// runtime fetch and nothing here needs a network round-trip.

import homeData from "@/data/home.json";
import menuData from "@/data/menu.json";
import footerData from "@/data/footer.json";
import stylesData from "@/data/styles.json";
import rootSeoData from "@/data/rootSeo.json";
import productsData from "@/data/products.json";
import categoriesData from "@/data/categories.json";
import formsData from "@/data/forms.json";
import type { Product } from "@/lib/data/interfaces.ts";
import type { CollectionCategory } from "@/components/renderers/collectionRenderer";
import type { FormProps } from "@/hooks/useFormControl.ts";
import type { PageInfoProps } from "@/components/pagination";
import type { rootSEO } from "@/components/seo/interfaces.ts";

export async function getHome() {
    return homeData;
}

export async function getMenu() {
    return menuData;
}

export async function getFooter() {
    return footerData;
}

export async function getStyles() {
    return stylesData;
}

export async function getRootSeo(): Promise<rootSEO> {
    return rootSeoData as rootSEO;
}

export async function getCategories(): Promise<CollectionCategory[]> {
    return categoriesData as CollectionCategory[];
}

// documentId is trusted to match a key in forms.json, mirroring the old
// (untyped) Strapi lookup's assumption that the id in the route param is valid.
export async function getForm(documentId: string): Promise<FormProps> {
    return (formsData as Record<string, FormProps>)[documentId];
}

export interface ProductFilters {
    title?: string;
    category?: string | null;
}

export interface ProductPagination {
    page: number;
    pageSize: number;
}

export const STANDARD_PAGINATION = {
    pagination: {
        page: 1,
        pageSize: 6,
    },
};

export interface ProductCollectionResult {
    nodes: Product[];
    pageInfo: PageInfoProps;
}

export async function getProducts(
    { filters, pagination }: { filters?: ProductFilters; pagination: ProductPagination },
): Promise<ProductCollectionResult> {
    const all = productsData as Product[];

    const titleFilter = filters?.title?.trim().toLowerCase() ?? "";
    const categoryFilter = filters?.category?.toLowerCase();

    const filtered = all.filter((product) => {
        const matchesTitle = titleFilter
            ? product.title.toLowerCase().includes(titleFilter)
            : true;
        const matchesCategory = categoryFilter
            ? (product as any).category?.name?.toLowerCase() === categoryFilter
            : true;
        return matchesTitle && matchesCategory;
    });

    const { page, pageSize } = pagination;
    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const nodes = filtered.slice(start, start + pageSize);

    return {
        nodes,
        pageInfo: { page, pageSize, pageCount, total },
    };
}

// slug is trusted to match a product, mirroring the old (untyped) Strapi
// lookup's assumption that products[0] existed for a valid route.
export async function getProduct(slug: string): Promise<Product> {
    const all = productsData as Product[];
    return all.find((product) => product.slug === slug) as Product;
}

// Content layer: every piece of site content comes from the content server
// (see src/lib/api/client.ts). Fetchers return server documents; the `to*`
// adapters map them onto the props existing components already take.

import { contentGet } from "@/lib/api/client.ts";
import type {
    ButtonDoc,
    CollectionDoc,
    CollectionSummary,
    FormDoc,
    NavItem,
    PageDoc,
    PageSeo,
    PrintDoc,
    ProductDoc,
    ProductSummary,
    SiteDoc,
} from "@/lib/api/types.ts";
import type { Product } from "@/lib/data/interfaces.ts";
import type { CollectionCategory } from "@/components/renderers/collectionRenderer";
import type { FormProps } from "@/hooks/useFormControl.ts";
import type { MenuItemProps } from "@/components/menuItem";
import type { pageSEO, rootSEO } from "@/components/seo/interfaces.ts";
import type { StylesContextProps } from "@/contexts/styles/stylesProvider.tsx";
import type { ButtonData } from "@/components/routerButton";

// ---------------------------------------------------------------- fetchers

export const getSite = () => contentGet<SiteDoc>("/site");
export const getPage = (slug: string) => contentGet<PageDoc>(`/pages/${encodeURIComponent(slug)}`);
export const getProductDoc = (slug: string) => contentGet<ProductDoc>(`/products/${encodeURIComponent(slug)}`);
export const getFormDoc = (id: string) => contentGet<FormDoc>(`/forms/${encodeURIComponent(id)}`);
export const getCollectionSummaries = () => contentGet<CollectionSummary[]>("/collections");
export const getCollection = (id: string, search?: string) =>
    contentGet<CollectionDoc>(`/collections/${encodeURIComponent(id)}`, { search });

/** Prints for sale, ordered by painting then price. */
export const getPrints = () => contentGet<PrintDoc[]>("/prints");
export const getPrint = (slug: string) => contentGet<PrintDoc>(`/prints/${encodeURIComponent(slug)}`);

export async function getProduct(slug: string): Promise<Product> {
    return toProduct(await getProductDoc(slug));
}

export async function getForm(id: string): Promise<FormProps> {
    return toForm(await getFormDoc(id));
}

// ---------------------------------------------------------------- site → layout props

export function toStyles(site: SiteDoc): StylesContextProps {
    const c = site.theme.colors;
    return {
        backgroundHex: c.background,
        menuHex: c.menu,
        primaryHex: c.primary,
        secondaryHex: c.secondary,
        textPrimaryHex: c.textPrimary,
        textSecondaryHex: c.textSecondary,
        wrapperHex: c.wrapper,
        textButtonHex: c.textButton,
        iconActiveHex: c.iconActive,
    };
}

/** Nav search `{ collection }` → the /products route's search params. */
export function toLinkSearch(search?: { collection?: string }): Record<string, string> | undefined {
    return search?.collection ? { collection: search.collection } : undefined;
}

function toMenuItem(item: NavItem, index: number, category: string): MenuItemProps {
    return {
        id: index + 1,
        displayName: item.label,
        slug: item.to,
        category,
        search: toLinkSearch(item.search),
    };
}

export function toHeaderMenu(site: SiteDoc) {
    const { title, items } = site.nav.header;
    return { title, mainMenuItems: items.map((item, i) => toMenuItem(item, i, "")) };
}

export function toFooterMenu(site: SiteDoc) {
    const { title, description, groups } = site.nav.footer;
    let index = 0;
    const footerMenuItems = groups.flatMap((group) => group.items.map((item) => toMenuItem(item, index++, group.title)));
    return { title, description, footerMenuItems };
}

export function toRootSeo(site: SiteDoc): rootSEO {
    return {
        siteName: site.seo.siteName,
        siteTitle: site.seo.title,
        siteDescription: site.seo.description,
        siteKeywords: site.seo.keywords,
        siteOGImage: site.seo.ogImage,
        canonicalDomain: site.url,
        robots: site.seo.robots,
    };
}

// ---------------------------------------------------------------- documents → component props

export function toPageSeo(seo: PageSeo, canonical?: string): pageSEO {
    return {
        title: seo.title,
        description: seo.description,
        keywords: seo.keywords,
        OGImage: seo.ogImage,
        robots: seo.robots,
        canonical,
    };
}

export function toButton(button: ButtonDoc, id: number): ButtonData {
    return {
        id,
        variant: button.variant,
        label: button.label,
        target: button.to.startsWith("http") ? "external" : "internal",
        route: button.to,
        search: toLinkSearch(button.search),
    };
}

export function toProduct(doc: ProductDoc): Product {
    const [image, ...images] = doc.images;
    return {
        title: doc.title,
        slug: doc.slug,
        image,
        images,
        ogImage: doc.ogImage,
        description: doc.description,
        tabs: doc.tabs.map((tab) => ({ title: tab.title, richDescription: tab.body })),
        dateCreated: doc.dateCreated,
        material: doc.material,
        shopifyHandle: doc.shopifyHandle,
        availability: doc.availability,
        store: doc.store,
        prints: doc.prints ?? [],
    };
}

/** Listing card data (what `List`/`Post` read: slug, title, image, category.name, shopifyHandle). */
export function toListItem(summary: ProductSummary) {
    return { ...summary, category: { name: summary.category } };
}

export function toForm(doc: FormDoc): FormProps {
    return {
        documentId: doc.id,
        title: doc.title,
        description: doc.description,
        image: doc.image,
        fields: doc.fields,
        successMessage: doc.successMessage,
        errorMessage: doc.errorMessage,
        fullWidth: doc.fullWidth,
    };
}

export function toCollectionCategories(summaries: CollectionSummary[]): CollectionCategory[] {
    return summaries.map((c) => ({
        category: { name: c.id },
        layoutTitle: c.title,
        layoutDescription: c.description,
        seo: {},
    }));
}

/** The form referenced by a page's `form` block (the page endpoint includes it). */
export function formFromPage(page: PageDoc): FormProps {
    const block = page.blocks.find((b) => b.type === "form");
    const form = block?.type === "form" ? page.included.forms[block.formId] : undefined;
    if (!form) throw new Error(`Page '${page.slug}' has no form block with an included form`);
    return toForm(form);
}

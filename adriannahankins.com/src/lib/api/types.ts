// Shapes of the documents served by the content server.
// Source of truth: server/content/README.md.

import type { StrapiImage } from "@/components/image";
import type { Fields } from "@/hooks/useFormControl.ts";

export type Image = StrapiImage;

export interface NavItem {
    label: string;
    to: string;
    external?: boolean;
    search?: { collection?: string };
}

/** Every word of UI copy a head renders that isn't page content. */
export interface SiteLabels {
    back: string;
    search: string;
    searchPlaceholder: string;
    reset: string;
    purchase: string;
    available: string;
    sold: string;
    soldOut: string;
    unavailable: string;
    prints: string;
    printsFrom: string;
    originalAvailable: string;
    originalSold: string;
    size: string;
    price: string;
    customPrinting: string;
    customPrintingFeatures: string[];
    varies: string;
    inquire: string;
    remove: string;
    of: string;
    enlargeImage: string;
    noResults: string;
    noPrintablePaintings: string;
    selected: string;
    showImage: string;
}

export interface SiteMessages {
    notFound: string;
    loadError: string;
    collectionError: string;
    formInvalid: string;
    formError: string;
    formSuccessDefault: string;
    fieldNotSupported: string;
}

export interface SiteDoc {
    $type: "site";
    name: string;
    url: string;
    locale: string;
    currency: string;
    contact: { email: string };
    social: { instagram?: { handle: string; url: string } };
    theme: {
        colors: Record<string, string>;
        /** heading defaults to body; stylesheet loads the web fonts (e.g. a Google Fonts URL). */
        fonts: { body: string; heading?: string; stylesheet?: string };
    };
    seo: {
        siteName: string;
        title: string;
        description: string;
        keywords: string;
        ogImage: Image;
        robots: "index,follow" | "noindex,nofollow";
        titleTemplate: string;
    };
    favicons: { png96: string; svg: string; ico: string; appleTouch: string; manifest: string };
    nav: {
        header: { title: string; items: NavItem[] };
        footer: { title: string; description: string; groups: { title: string; items: NavItem[] }[] };
    };
    /** null when the tenant has no mailing list. */
    mailing: null | {
        formId: string;
        title: string;
        description: string;
        consentPrefix: string;
        consentLink: { label: string; to: string };
    };
    labels: SiteLabels;
    messages: SiteMessages;
    integrations: { shopify: { printClubHandle: string }; email: { recipient: string; fromName: string } };
}

export interface PageSeo {
    title: string;
    description: string;
    keywords?: string;
    ogImage?: Image;
    robots?: string;
}

export interface ButtonDoc {
    label: string;
    variant: "primary" | "secondary";
    to: string;
    search?: { collection?: string };
}

export interface PrintClubBlock {
    type: "printClub";
    subscriptionHandle: string;
    intro: { headline: string; paragraphs: string[]; image: Image; ctaLabel: string };
    announcement: {
        headlineLines: string[];
        price: { prefix: string; amount: string; note: string };
        ctaLabel: string;
    };
    details: { title: string; body: string; benefitsTitle: string; benefits: string[] };
    closing: { headline: string; ctaLabel: string };
}

export type Block =
    | {
          type: "hero";
          title: string;
          description: string;
          primary: ButtonDoc;
          secondary: ButtonDoc;
          heroImage: Image;
          profileImage: Image;
      }
    | { type: "collection"; defaultCollection: string; views: { id: string; columns: number }[] }
    | { type: "imageText"; image: Image; imagePosition: "start" | "end"; body: string }
    | { type: "faq"; items: { question: string; answer: string }[] }
    | { type: "richText"; body: string }
    | { type: "form"; formId: string }
    | PrintClubBlock;

export interface FormDoc {
    $type: "form";
    id: string;
    title: string;
    description: string;
    successMessage?: string;
    errorMessage?: string;
    fullWidth?: boolean;
    image?: Image;
    fields: Fields[];
}

/** Sale status for works sold off-platform (no Shopify listing). */
export interface Availability {
    status: "available" | "sold" | "unavailable";
    /** Display price, e.g. "$850" or "$200, Framed". */
    price?: string;
    /** Shown instead of a price when unavailable, e.g. "Personal Collection". */
    label?: string;
}

export interface CollectionSummary {
    id: string;
    title: string;
    description: string;
}

export interface ProductSummary {
    slug: string;
    title: string;
    category: string;
    image: Image;
    dateCreated?: string;
    shopifyHandle?: string;
    availability?: Availability;
}

export interface CollectionDoc extends CollectionSummary {
    $type: "collection";
    seo: PageSeo;
    products: ProductSummary[];
}

export interface PageDoc {
    $type: "page";
    slug: string;
    seo: PageSeo;
    layout?: { title: string; description: string };
    blocks: Block[];
    included: { forms: Record<string, FormDoc>; collections: Record<string, Omit<CollectionDoc, "products">> };
}

export interface ProductDoc {
    $type: "product";
    slug: string;
    title: string;
    category: string;
    description: string;
    images: Image[];
    ogImage?: Image;
    tabs: { title: string; body: string }[];
    material?: string;
    dateCreated?: string;
    shopifyHandle?: string;
    availability?: Availability;
}

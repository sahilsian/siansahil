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
    /** Breadcrumb root on artwork pages. */
    gallery?: string;
    /** Line above the list of print sizes on an artwork page. */
    availableInPrints?: string;
    /** Artwork page line after the prints list when the original is available; followed by the inquire link. */
    originalAlsoAvailable?: string;
    /** "15 copies" in a limited edition. */
    copies?: string;
    /** Artwork page print buttons: "24 x 36 (Limited)". */
    limited?: string;
    /** Print page: "Limited edition of 15 copies". */
    limitedEdition?: string;
    /** Print page: the checkout button. */
    buy?: string;
    /** Prints not on sale yet (an upcoming drop), in place of Buy. */
    comingSoon?: string;
    /** Print page: link back to the painting. */
    viewPainting?: string;
    /** Prints page: shown when nothing is for sale. */
    noPrints?: string;
    /** Line under "Original Available" on the prints page; followed by the inquire link. */
    originalAvailableNote?: string;
    /** Inquiry pop-up's starting message when theme.itemInquiry is on; {title} = the item's name. */
    inquiryMessage?: string;
    /** /order-complete, where buyers land after paying for a print. */
    orderThanksTitle?: string;
    orderThanksBody?: string;
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
    /**
     * How this site looks. Every site runs the same code; anything that should
     * differ between sites is set here (missing values fall back to the defaults).
     */
    theme: {
        /** See src/lib/theme.ts for the keys, e.g. paper, border, link, buttonBackground. */
        colors: Record<string, string>;
        /** heading defaults to body; stylesheet loads the web fonts (e.g. a Google Fonts URL). */
        fonts: { body: string; heading?: string; stylesheet?: string };
        /**
         * Home page hero: "photo" (default) = a full rectangular photo beside the text;
         * "cutout" = a transparent cut-out photo anchored to the bottom right behind the text.
         */
        hero?: "cutout" | "photo";
        /** Gallery cards show the price / Sold / Unavailable under the title (default true). */
        galleryStatus?: boolean;
        /** Every item's page has an Inquire button (e.g. events to book), not just available works. */
        itemInquiry?: boolean;
    };
    /** What this site's gallery items are called (default "artwork" / "artworks"), e.g. "event" / "events". */
    terms?: { item?: string; items?: string };
    /** Dashboard sections a site doesn't use (default all on). */
    features?: { prints?: boolean };
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
    /** Print sizes set in the dashboard Store page. */
    store?: { printSizes?: { id: string; label: string; priceCents: number }[] };
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

/**
 * Two columns, text and image, side by side and vertically centred; each column is
 * at least 357px wide, so they stack on phones. Put several in a row to stack sections,
 * with `reverse` to alternate which side the image is on.
 */
export interface ColBlock {
    type: "col";
    title?: string;
    /** Markdown. */
    body: string;
    image: Image;
    /** Image on the left instead of the right. */
    reverse?: boolean;
    primary?: ButtonDoc;
    secondary?: ButtonDoc;
    /** "screen" (default on the home page): at least the viewport's height on laptops and up. */
    height?: "screen" | "auto";
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
          /** Required unless heroVideo is set. */
          heroImage?: Image;
          /** Plays (muted, looping) in place of heroImage, centre-cropped to the same frame; heroImage (if any) is its poster. */
          heroVideo?: { url: string; type?: string };
          /** The round avatar beside the name; left out = no avatar. */
          profileImage?: Image;
      }
    | { type: "collection"; defaultCollection: string; views: { id: string; columns: number }[] }
    | { type: "imageText"; image: Image; imagePosition: "start" | "end"; body: string }
    | ColBlock
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
    store?: ArtworkStore;
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
    store?: ArtworkStore;
    /** Prints of this painting that are for sale (each is its own listing). */
    prints?: PrintLink[];
}

/** A print as linked from its painting's page. */
export interface PrintLink {
    slug: string;
    title: string;
    size: { width: number; height: number; unit: "in" };
    /** "24 x 36" */
    sizeLabel: string;
    editionSize?: number;
    /** Every copy of the limited edition has sold. */
    soldOut?: boolean;
    /** Shown, but not buyable until the drop (no `buyUrl`). */
    comingSoon?: boolean;
}

/** A print listing (GET /prints, /prints/{slug}). */
export interface PrintDoc extends PrintLink {
    $type: "print";
    painting: string;
    priceCents: number;
    currency: string;
    description?: string;
    /** Mockups etc.; empty = use the painting's photo. */
    images: Image[];
    forSale: boolean;
    /** Stripe checkout page; absent when it can't be bought online (then: inquire). */
    buyUrl?: string;
    /** "Mount Pleasant | Archival Limited Edition 24 x 36" */
    name: string;
    artwork: { slug: string; title: string; image: Image | null };
}

/** One thing for sale: a Stripe product with one price (set from the dashboard). */
export interface StoreItem {
    priceCents: number;
    stripeProductId: string;
    stripePriceId: string;
    active: boolean;
}

/** What an artwork sells. Inactive items are no longer for sale. */
export interface ArtworkStore {
    currency: string;
    /** Visitors can inquire about the original (it has no price). */
    originalAvailable?: boolean;
    /** Only on artworks priced before the original became inquiry-only. */
    original: StoreItem | null;
    prints: (StoreItem & { sizeId: string; label: string })[];
}

/** A work sold outside the store, e.g. privately. */
export interface Availability {
    status: "available" | "sold" | "unavailable";
    price?: string;
    label?: string;
}

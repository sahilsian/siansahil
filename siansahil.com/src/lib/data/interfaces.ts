import {StrapiImage} from "@/components/image";
import {Tab} from "@/components/tabbedContent";
import {ShopifyProductData} from "@/lib/shopify";

export interface Product {
    title:string;
    slug:string;
    image: StrapiImage;
    // Extra images shown after the main one on the product page (thumbnails + lightbox).
    images?: StrapiImage[];
    // Small (~1200px) copy for link previews; social sites reject the full-size files.
    ogImage?: StrapiImage;
    description:string;
    tabs: Tab[];
    dateCreated?: string;
    material?: string;
    shopifyHandle?: string;
    gallery?: boolean;
    shop?: ShopifyProductData | null;
}
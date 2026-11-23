import {StrapiImage} from "@/components/image";
import {Tab} from "@/components/tabbedContent";
import type {ArtworkStore, Availability} from "@/lib/api/types.ts";

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
    availability?: Availability;
    gallery?: boolean;
    store?: ArtworkStore;
}
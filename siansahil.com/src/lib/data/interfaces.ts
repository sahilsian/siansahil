import {StrapiImage} from "@/components/image";
import {Tab} from "@/components/tabbedContent";
import {ShopifyProductData} from "@/lib/shopify";

export interface Product {
    title:string;
    slug:string;
    image: StrapiImage;
    description:string;
    tabs: Tab[];
    dateCreated?: string;
    material?: string;
    shopifyHandle?: string;
    shop?: ShopifyProductData | null;
}
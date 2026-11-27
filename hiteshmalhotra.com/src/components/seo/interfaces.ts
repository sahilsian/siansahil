import {StrapiImage} from "@/components/image";

/*
Root SEO interface for the site
 */
export interface rootSEO {
    siteName: string
    siteTitle: string
    siteDescription: string
    siteKeywords: string
    siteOGImage: StrapiImage
    canonicalDomain: string
    robots: "index,follow" | "noindex,nofollow"
}

/*
Page Overrides on RootSEO
 */
export interface pageSEO {
    title?: string
    description?: string
    keywords?: string
    OGImage?: StrapiImage
    canonical?: string
    robots?: string
}

export interface categorySEO extends pageSEO {}
import CollectionLayout from "@/layouts/collection";
import {PageInfoProps} from "@/components/pagination";
import type {pageSEO} from "@/components/seo/interfaces.ts";

interface CollectionRendererProps {
    blocks?: any[];
    collection: any[];
    type: string;
    pageInfo: PageInfoProps
    categories: CollectionCategory[]
    /** Id of the collection being shown (from ?collection= or the page default). */
    currentCollection: string
}

export interface CollectionCategory {
    category: { name: string }
    layoutTitle: string
    layoutDescription: string
    seo: pageSEO
}

// Collection Factory
const CollectionRenderer = ({collection, type, pageInfo, categories, currentCollection}: CollectionRendererProps) => {
    return <CollectionLayout
            type={type}
            collection={collection}
            pageInfo={pageInfo}
            categories={categories}
            currentCollection={currentCollection}
        ></CollectionLayout>
}

export default CollectionRenderer

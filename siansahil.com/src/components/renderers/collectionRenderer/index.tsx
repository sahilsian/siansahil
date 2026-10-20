import CollectionLayout from "@/layouts/collection";
import {PageInfoProps} from "@/components/pagination";
import type {pageSEO} from "@/components/seo/interfaces.ts";

interface CollectionRendererProps {
    blocks?: any[];
    collection: any[];
    type: string;
    pageInfo: PageInfoProps
    categories: CollectionCategory[]
}

export interface CollectionCategory {
    category: { name: string }
    layoutTitle: string
    layoutDescription: string
    // structuredData is omitted: pageSEO types it as the global `JSON`
    // interface (parse/stringify), which TanStack Router's loader-data
    // serializability check rejects.
    seo: Omit<pageSEO, 'structuredData'>
}

// Collection Factory
const CollectionRenderer = ({collection, type, pageInfo, categories}: CollectionRendererProps) => {
    return <CollectionLayout
            type={type}
            collection={collection}
            pageInfo={pageInfo}
            categories={categories}
        ></CollectionLayout>
}

export default CollectionRenderer

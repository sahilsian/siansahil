import {createFileRoute} from '@tanstack/react-router'
import {
    getCollection,
    getCollectionSummaries,
    getPage,
    toCollectionCategories,
    toListItem,
    toPageSeo,
} from "@/lib/content";
import CollectionRenderer from "@/components/renderers/collectionRenderer";
import {getShopifyProductsByHandles} from "@/lib/shopify";
import {pageHead} from "@/lib/seo.ts";

// The page document that configures this listing (its `collection` block).
const PAGE_SLUG = "products"

export const Route = createFileRoute('/products/')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            title: search.title ? String(search.title) : undefined,
            collection: search.collection ? String(search.collection) : undefined,
        }
    },
    component: RouteComponent,
    loaderDeps: ({ search: { title, collection } }) => ({ title, collection }),
    loader: async ({context, deps: { title, collection } }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ["page", PAGE_SLUG],
            queryFn: () => getPage(PAGE_SLUG),
        })
        const block = page.blocks.find((b) => b.type === "collection")
        const collectionId = collection ?? (block?.type === "collection" ? block.defaultCollection : undefined)
        if (!collectionId) throw new Error(`Page '${PAGE_SLUG}' has no collection block`)

        const [summaries, current] = await Promise.all([
            context.queryClient.ensureQueryData({
                queryKey: ["collections"],
                queryFn: getCollectionSummaries,
            }),
            // Not paginated: every matching product is shown at once.
            context.queryClient.fetchQuery({
                queryKey: ["collection", collectionId, title ?? ""],
                queryFn: () => getCollection(collectionId, title),
            }),
        ])

        const handles = current.products
            .map((product) => product.shopifyHandle)
            .filter((handle): handle is string => !!handle)

        const shopByHandle = handles.length > 0
            ? await context.queryClient.ensureQueryData({
                queryFn: () => getShopifyProductsByHandles({ data: { handles } }),
                queryKey: ["shopifyProducts", handles.join(",")]
            })
            : {}

        const items = current.products.map((product) => ({
            ...toListItem(product),
            shop: product.shopifyHandle ? shopByHandle[product.shopifyHandle] ?? null : null,
        }))

        return {
            items,
            collectionId,
            seo: toPageSeo(current.seo),
            categories: toCollectionCategories(summaries),
        }
    },
    head: ({ loaderData }) => pageHead(loaderData?.seo),
})

function RouteComponent() {
    const { items, categories, collectionId } = Route.useLoaderData()
    return <div>
        <CollectionRenderer
            type={"product"}
            pageInfo={{ page: 1, pageSize: items.length, pageCount: 1, total: items.length }}
            collection={items}
            categories={categories}
            currentCollection={collectionId}
        >
        </CollectionRenderer>
    </div>
}

import {createFileRoute} from '@tanstack/react-router'
import {getCategories, getProducts, STANDARD_PAGINATION} from "@/lib/content";
import CollectionRenderer from "@/components/renderers/collectionRenderer";
import {pageSEO} from "@/components/seo/interfaces.ts";
import {getShopifyProductsByHandles} from "@/lib/shopify";

export const Route = createFileRoute('/products/')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            page: search.page ? Number(search.page) : undefined,
            pageSize: search.pageSize ? Number(search.pageSize) : undefined,
            title: search.title ? String(search.title) : undefined,
            category: search.category ? String(search.category) : undefined
        }
    },
    component: RouteComponent,
    loaderDeps: ({ search: { page, pageSize, title, category } }) => ({ page, pageSize, title, category }),
    loader: async ({context,  deps: { page, pageSize, title, category } }) => {

        const pagination = {
            page: page ?? STANDARD_PAGINATION.pagination.page,
            pageSize: pageSize ?? STANDARD_PAGINATION.pagination.pageSize,
        }

        const categoryFilter = (category && category !== "all") ? category : null;

        const filters = {
            title: title || "",
            category: categoryFilter,
        };

        const categories = await context.queryClient.ensureQueryData({
            queryFn: getCategories,
            queryKey: ["categories"]
        })

        const products = await context.queryClient.fetchQuery({
            queryFn: () => getProducts({pagination, filters}),
            queryKey: ["products", page, pageSize, title, categoryFilter],
        })

        const handles = products.nodes
            .map((product) => product.shopifyHandle)
            .filter((handle): handle is string => !!handle)

        const shopByHandle = handles.length > 0
            ? await context.queryClient.ensureQueryData({
                queryFn: () => getShopifyProductsByHandles({ data: { handles } }),
                queryKey: ["shopifyProducts", handles.join(",")]
            })
            : {}

        products.nodes = products.nodes.map((product) => ({
            ...product,
            shop: product.shopifyHandle ? shopByHandle[product.shopifyHandle] ?? null : null,
        }))

        const selectedCategory =
            categories.find(
                (obj: any) =>
                    category && obj.category.name === category
            ) ??
            categories.find(
                (obj: any) => obj.category.name === 'all'
            )

        return {products, categories, selectedCategory}
    },
    head: ({ loaderData }) => {
        const seo:pageSEO = loaderData?.selectedCategory?.seo ?? {
            title: 'Fluentclicks.com',
            description: 'Fluentclicks uses AI to generate leads that speak fluently to your business processes.',
            canonical: 'siansahil.com',
            OGImage: { url: '', width: 0, height: 0, alternativeText: '', name: '' },
        }

        return {
            meta: [
                { title: seo.title },
                { name: "description", content: seo.description},
                // OPEN GRAPH
                { property: 'og:title', content: seo.title },
                { property: 'og:description', content: seo.description },
                { property: 'og:image', content: seo.OGImage?.url || "" },
                { property: 'og:type', content: "website" }
            ],
            links: [

                { rel: 'canonical', href: seo.canonical }
            ],
        }
    },
})

function RouteComponent() {
    const { products, categories } = Route.useLoaderData()
  return <div>
      <CollectionRenderer
          type={"product"}
          pageInfo={products.pageInfo}
          collection={products.nodes}
          categories={categories}
      >
      </CollectionRenderer>
  </div>
}

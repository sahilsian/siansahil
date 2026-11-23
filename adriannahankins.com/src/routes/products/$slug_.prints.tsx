import {createFileRoute} from '@tanstack/react-router'
import {getProduct, getSite} from "@/lib/content";
import ArtworkPrintsLayout from "@/layouts/artworkPrints";

// /products/<slug>/prints — the artwork's print sizes. The trailing underscore in
// the file name keeps this page separate from the artwork page (not nested in it).
export const Route = createFileRoute('/products/$slug_/prints')({
    component: RouteComponent,
    loader: async ({context, params}) => {
        const [product, site] = await Promise.all([
            context.queryClient.ensureQueryData({
                queryFn: () => getProduct(params.slug),
                queryKey: ["product", params.slug],
            }),
            context.queryClient.ensureQueryData({ queryKey: ["site"], queryFn: getSite }),
        ])
        return { product, siteUrl: site.url.replace(/\/+$/, ""), printsWord: site.labels.prints ?? "Prints" }
    },
    head: ({loaderData}) => {
        if (!loaderData) return {}
        const { product, siteUrl, printsWord } = loaderData
        const title = `${product.title} ${printsWord}`
        const ogImage = product.ogImage ?? product.image
        const ogImageUrl = ogImage.url.startsWith("http") ? ogImage.url : siteUrl + ogImage.url
        return {
            meta: [
                { title },
                { name: "description", content: product.description },
                { property: 'og:title', content: title },
                { property: 'og:description', content: product.description },
                { property: 'og:image', content: ogImageUrl },
                { property: 'og:url', content: `${siteUrl}/products/${product.slug}/prints` },
                { property: 'og:type', content: "website" },
                { name: 'twitter:card', content: "summary_large_image" },
            ]
        }
    },
})

function RouteComponent() {
    const { product } = Route.useLoaderData()
    return <ArtworkPrintsLayout product={product} />
}

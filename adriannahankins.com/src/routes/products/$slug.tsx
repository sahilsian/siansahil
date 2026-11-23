import {createFileRoute} from '@tanstack/react-router'
import {getProduct, getSite} from "@/lib/content";
import ProductRenderer from "@/components/renderers/productRenderer";

export const Route = createFileRoute('/products/$slug')({
  component: RouteComponent,
    loader: async ({context, params}) => {
        const { slug } = params;

        const [product, site] = await Promise.all([
            context.queryClient.ensureQueryData({
                queryFn: () => getProduct(slug),
                queryKey: ["product", slug]
            }),
            // Already cached by the root route; needed for absolute Open Graph URLs.
            context.queryClient.ensureQueryData({ queryKey: ["site"], queryFn: getSite }),
        ])

        return {
            product,
            siteUrl: site.url.replace(/\/+$/, ""),
        }
    },
    head: ({loaderData}) => {
      if(!loaderData) return {}

      // Open Graph images must be absolute URLs.
      const { product, siteUrl } = loaderData;
      const ogImage = product.ogImage ?? product.image;
      const ogImageUrl = ogImage.url.startsWith("http") ? ogImage.url : siteUrl + ogImage.url;

      return {
            meta: [
                { title: loaderData.product.title },
                { name: "description", content: loaderData.product.description},
                // OPEN GRAPH
                { property: 'og:title', content:  loaderData.product.title },
                { property: 'og:description', content: loaderData.product.description },
                { property: 'og:image', content: ogImageUrl },
                { property: 'og:image:width', content: String(ogImage.width) },
                { property: 'og:image:height', content: String(ogImage.height) },
                { property: 'og:image:alt', content: ogImage.alternativeText ?? product.title },
                { property: 'og:url', content: `${siteUrl}/products/${product.slug}` },
                { property: 'og:type', content: "website" },
                // TWITTER / X
                { name: 'twitter:card', content: "summary_large_image" },
                { name: 'twitter:title', content: product.title },
                { name: 'twitter:description', content: product.description },
                { name: 'twitter:image', content: ogImageUrl },
            ]
        }
    }
})

function RouteComponent() {
    const { product } = Route.useLoaderData()
    return <div>
        <ProductRenderer
            type={"product"}
            product={product}
        >
        </ProductRenderer>
    </div>
}

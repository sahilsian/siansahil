import {createFileRoute} from '@tanstack/react-router'
import {getProduct} from "@/lib/content";
import ProductRenderer from "@/components/renderers/productRenderer";

export const Route = createFileRoute('/products/$slug')({
  component: RouteComponent,
    loader: async ({context, params}) => {
        const { slug } = params;

        const product = await context.queryClient.ensureQueryData({
            queryFn: () => getProduct(slug),
            queryKey: ["product", slug]
        })

        return {
            product
        }
    },
    head: ({loaderData}) => {
      if(!loaderData) {
          return {
              meta: [
                  { title: "Fluentclicks.com" },
                  { name: "description", content: 'Fluentclicks uses AI to generate leads that speak fluently to your business processes.'},
                  // OPEN GRAPH
                  { property: 'og:title', content:  "Fluentclicks.com" },
                  { property: 'og:description', content:  'Fluentclicks uses AI to generate leads that speak fluently to your business processes.'},
                  { property: 'og:image', content: "" },
                  { property: 'og:type', content: "website" }
              ]
          }
      }

      return {
            meta: [
                { title: loaderData.product.title },
                { name: "description", content: loaderData.product.description},
                // OPEN GRAPH
                { property: 'og:title', content:  loaderData.product.title },
                { property: 'og:description', content: loaderData.product.description },
                { property: 'og:image', content: loaderData.product.image.url || "" },
                { property: 'og:type', content: "website" }
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

import { createFileRoute } from '@tanstack/react-router';
import { getHome } from "@/lib/content";
import BlockRenderer from "@/components/renderers/blockRenderer";
import {pageSEO} from "@/components/seo/interfaces.ts";

export const Route = createFileRoute('/')(
    {
        loader: async ({context}) => {
            try {
                const home = await context.queryClient.ensureQueryData({
                    queryKey: ['home'],
                    queryFn: getHome
                })
                return {
                    home,
                    seo: home.seo
                }
            } catch (error) {
                console.error(error)
                return {
                    home: null
                }
            }

        },
        head: ({ loaderData }) => {
            const seo: pageSEO = loaderData?.seo ?? {
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
        component: HomePage
    }
)

function HomePage() {
    const { home } = Route.useLoaderData();
    const blocks:any[] = [
        home!.wrapper.hero,
    ]
    return (
        <div>
            <BlockRenderer blocks={blocks} />
        </div>
  )
}

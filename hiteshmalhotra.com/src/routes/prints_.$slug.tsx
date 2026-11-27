import { createFileRoute } from '@tanstack/react-router'
import { getPrint, getSite } from "@/lib/content";
import PrintLayout from "@/layouts/prints/print.tsx";
import { printImage, printListName } from "@/layouts/prints/list.tsx";

// /prints/<slug> — one print, where it's bought. The trailing underscore keeps it
// a page of its own rather than nested inside /prints.
export const Route = createFileRoute('/prints_/$slug')({
    component: RouteComponent,
    loader: async ({ context, params }) => {
        const [print, site] = await Promise.all([
            context.queryClient.ensureQueryData({ queryKey: ["print", params.slug], queryFn: () => getPrint(params.slug) }),
            context.queryClient.ensureQueryData({ queryKey: ["site"], queryFn: getSite }),
        ])
        return { print, siteUrl: site.url.replace(/\/+$/, "") }
    },
    head: ({ loaderData }) => {
        if (!loaderData) return {}
        const { print, siteUrl } = loaderData
        const title = printListName(print)
        const description = `${title}. A print of “${print.artwork.title}”.`
        const image = printImage(print)
        const imageUrl = image ? (image.url.startsWith("http") ? image.url : siteUrl + image.url) : undefined
        return {
            meta: [
                { title },
                { name: "description", content: description },
                { property: 'og:title', content: title },
                { property: 'og:description', content: description },
                ...(imageUrl ? [{ property: 'og:image', content: imageUrl }] : []),
                { property: 'og:url', content: `${siteUrl}/prints/${print.slug}` },
                { property: 'og:type', content: "product" },
                { name: 'twitter:card', content: "summary_large_image" },
            ]
        }
    },
})

function RouteComponent() {
    const { print } = Route.useLoaderData()
    return <PrintLayout print={print} />
}

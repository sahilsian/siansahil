import { createFileRoute } from '@tanstack/react-router'
import { getPage, getPrints, toPageSeo } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import PageLayout from "@/layouts/page";
import PrintList from "@/layouts/prints/list.tsx";

const PAGE_SLUG = "prints"

// /prints — every print for sale (each is its own listing, linked to a painting).
export const Route = createFileRoute('/prints')({
    component: RouteComponent,
    loader: async ({ context }) => {
        const [page, prints] = await Promise.all([
            context.queryClient.ensureQueryData({ queryKey: ["page", PAGE_SLUG], queryFn: () => getPage(PAGE_SLUG) }),
            context.queryClient.ensureQueryData({ queryKey: ["prints"], queryFn: getPrints }),
        ])
        return { page, prints, seo: toPageSeo(page.seo) }
    },
    head: ({ loaderData }) => pageHead(loaderData?.seo),
})

function RouteComponent() {
    const { page, prints } = Route.useLoaderData()
    return (
        <PageLayout title={page.layout?.title ?? "Prints"} description={page.layout?.description ?? ""}>
            <PrintList prints={prints} />
        </PageLayout>
    )
}

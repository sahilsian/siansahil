import { createFileRoute, notFound } from '@tanstack/react-router'
import { getPage, toPageSeo } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import PageLayout from "@/layouts/page";
import PageBlocks from "@/components/renderers/pageBlocks";

// Any page document with a `layout` (About, FAQ, Privacy Policy, ...) renders
// here: adding a page on the server needs no code in the head. Routes with
// their own file (/, /products, /contact, ...) take precedence over this one.
export const Route = createFileRoute('/$slug')({
    loader: async ({ context, params }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ['page', params.slug],
            queryFn: () => getPage(params.slug),
        })
        // Pages without a layout (home, products, contact, ...) belong to their own routes.
        if (!page.layout) throw notFound()
        return { page, layout: page.layout }
    },
    head: ({ loaderData }) => pageHead(loaderData && toPageSeo(loaderData.page.seo)),
    component: RouteComponent,
})

function RouteComponent() {
    const { page, layout } = Route.useLoaderData()
    return (
        <PageLayout title={layout.title} description={layout.description}>
            <PageBlocks blocks={page.blocks}></PageBlocks>
        </PageLayout>
    )
}

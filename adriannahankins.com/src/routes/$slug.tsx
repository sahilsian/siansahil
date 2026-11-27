import { createFileRoute, notFound } from '@tanstack/react-router'
import { formFromPage, getPage, toPageSeo } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import PageLayout from "@/layouts/page";
import PageBlocks from "@/components/renderers/pageBlocks";
import FormRenderer from "@/components/renderers/formRenderer";

// Any page document renders here, so adding a page on the server needs no code in
// the head:
//   - a page with a `layout` (About, FAQ, Privacy Policy, ...) shows its blocks;
//   - a page that is just a form (e.g. /inquire) shows that form, like /contact.
// Routes with their own file (/, /products, /contact, ...) take precedence over this one.
export const Route = createFileRoute('/$slug')({
    loader: async ({ context, params }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ['page', params.slug],
            queryFn: () => getPage(params.slug),
        })
        if (page.layout) return { page, layout: page.layout, form: null }
        if (page.blocks.some((block) => block.type === "form")) return { page, layout: null, form: formFromPage(page) }
        // Pages without either (home, products, ...) belong to their own routes.
        throw notFound()
    },
    head: ({ loaderData }) => pageHead(loaderData && toPageSeo(loaderData.page.seo)),
    component: RouteComponent,
})

function RouteComponent() {
    const { page, layout, form } = Route.useLoaderData()
    if (form) {
        return (
            <div>
                <FormRenderer type={"layout"} form={form}></FormRenderer>
            </div>
        )
    }
    return (
        <PageLayout title={layout!.title} description={layout!.description}>
            <PageBlocks blocks={page.blocks}></PageBlocks>
        </PageLayout>
    )
}

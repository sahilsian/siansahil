import { createFileRoute } from '@tanstack/react-router'
import { formFromPage, getPage, toPageSeo } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import FormRenderer from "@/components/renderers/formRenderer";

const PAGE_SLUG = "commissions"

export const Route = createFileRoute('/commissions')({
    component: RouteComponent,
    loader: async ({ context }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ["page", PAGE_SLUG],
            queryFn: () => getPage(PAGE_SLUG),
        })
        return { form: formFromPage(page), seo: toPageSeo(page.seo) }
    },
    head: ({ loaderData }) => pageHead(loaderData?.seo),
})

function RouteComponent() {
    const { form } = Route.useLoaderData()
    return (
        <div>
            <FormRenderer
                type={"layout"}
                form={form}
            >
            </FormRenderer>
        </div>
    )
}

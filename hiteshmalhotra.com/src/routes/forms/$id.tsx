import { createFileRoute } from '@tanstack/react-router'
import { getForm } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import FormRenderer from "@/components/renderers/formRenderer";

export const Route = createFileRoute('/forms/$id')({
    component: RouteComponent,
    loader: async ({ context, params }) => {
        const form = await context.queryClient.ensureQueryData({
            queryFn: () => getForm(params.id),
            queryKey: ["form", params.id]
        })
        return { form }
    },
    head: ({ loaderData }) =>
        pageHead(loaderData && { title: loaderData.form.title, description: loaderData.form.description }),
})

function RouteComponent() {
    const { form } = Route.useLoaderData()
    return <div>
        <FormRenderer
            type={"layout"}
            form={form}
        >
        </FormRenderer>
    </div>
}

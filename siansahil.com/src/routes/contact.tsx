import { createFileRoute } from '@tanstack/react-router'
import {getForm} from "@/lib/content";
import FormRenderer from "@/components/renderers/formRenderer";

export const Route = createFileRoute('/contact')({
    component: RouteComponent,
    loader: async ({context}) => {
        const form = await context.queryClient.ensureQueryData({
            queryFn: () => getForm("contact"),
            queryKey: ["form", "contact"]
        })
        return {
            form
        }
    },
    head: () => {
        return {
            meta: [
                { title: "Contact — Sahil Sian" },
                { name: "description", content: "sahilsiantech@gmail.com" },
            ]
        }
    }
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

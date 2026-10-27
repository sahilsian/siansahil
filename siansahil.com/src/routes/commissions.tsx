import { createFileRoute } from '@tanstack/react-router'
import {getForm} from "@/lib/content";
import FormRenderer from "@/components/renderers/formRenderer";

export const Route = createFileRoute('/commissions')({
    component: RouteComponent,
    loader: async ({context}) => {
        const form = await context.queryClient.ensureQueryData({
            queryFn: () => getForm("commission"),
            queryKey: ["form", "commission"]
        })
        return {
            form
        }
    },
    head: () => {
        return {
            meta: [
                { title: "Commissions — Sahil Sian" },
                { name: "description", content: "Request a commissioned painting from Sahil Sian." },
                { property: 'og:title', content: "Commissions — Sahil Sian" },
                { property: 'og:description', content: "Request a commissioned painting from Sahil Sian." },
                { property: 'og:type', content: "website" }
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

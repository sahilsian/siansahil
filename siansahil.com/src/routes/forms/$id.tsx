import { createFileRoute } from '@tanstack/react-router'
import {getForm} from "@/lib/content";
import FormRenderer from "@/components/renderers/formRenderer";

export const Route = createFileRoute('/forms/$id')({
    component: RouteComponent,
    loader: async ({context, params}) => {
        const { id } = params;
        const form = await context.queryClient.ensureQueryData({
            queryFn: () => getForm(id),
            queryKey: ["form", id]
        })
        return {
            form
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
                { title: loaderData.form.title },
                { name: "description", content: loaderData.form.description},
                // OPEN GRAPH
                { property: 'og:title', content:  loaderData.form.title },
                { property: 'og:description', content: loaderData.form.description },
                { property: 'og:type', content: "website" }
            ]
        }
    }
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

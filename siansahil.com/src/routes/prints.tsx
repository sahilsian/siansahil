import { createFileRoute } from '@tanstack/react-router'
import {getForm, PAINTINGS} from "@/lib/content";
import {getShopifyProductsByHandles} from "@/lib/shopify";
import FormRenderer from "@/components/renderers/formRenderer";
import {FormProps} from "@/hooks/useFormControl.ts";

export const Route = createFileRoute('/prints')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            painting: search.painting ? String(search.painting) : undefined
        }
    },
    component: RouteComponent,
    loader: async ({context}) => {
        const form = await context.queryClient.ensureQueryData({
            queryFn: () => getForm("print"),
            queryKey: ["form", "print"]
        })

        const handles = PAINTINGS
            .map((product) => product.shopifyHandle)
            .filter((handle): handle is string => !!handle)

        const shopByHandle = handles.length > 0
            ? await context.queryClient.ensureQueryData({
                queryFn: () => getShopifyProductsByHandles({ data: { handles } }),
                queryKey: ["shopifyProducts", handles.join(",")]
            })
            : {}

        // Only paintings with at least one print variant for sale can be picked.
        const printableSlugs = PAINTINGS
            .filter((product) => product.shopifyHandle && shopByHandle[product.shopifyHandle]?.prints.some((print) => print.availableForSale))
            .map((product) => product.slug)

        return {
            form,
            printableSlugs
        }
    },
    head: () => {
        return {
            meta: [
                { title: "Custom Prints — Sahil Sian" },
                { name: "description", content: "Inquire about a custom canvas print of a painting by Sahil Sian." },
                { property: 'og:title', content: "Custom Prints — Sahil Sian" },
                { property: 'og:description', content: "Inquire about a custom canvas print of a painting by Sahil Sian." },
                { property: 'og:type', content: "website" }
            ]
        }
    }
})

function RouteComponent() {
    const { form, printableSlugs } = Route.useLoaderData()
    const { painting } = Route.useSearch()

    const printForm: FormProps = {
        ...form,
        fields: form.fields.map((field) =>
            field.metadata.fieldType === 'painting' ? { ...field, slugs: printableSlugs } : field
        )
    }

    // Only preselect slugs that match a selectable painting, so a stale link
    // can't satisfy the required field with a value no card represents.
    const preselected = painting && printableSlugs.includes(painting) ? painting : undefined
    return (
        <div>
            <FormRenderer
                key={preselected ?? "none"}
                type={"layout"}
                form={printForm}
                initialValues={preselected ? { painting: preselected } : undefined}
            >
            </FormRenderer>
        </div>
    )
}

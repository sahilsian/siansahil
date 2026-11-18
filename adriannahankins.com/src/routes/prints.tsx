import { createFileRoute } from '@tanstack/react-router'
import { formFromPage, getCollection, getPage, toPageSeo } from "@/lib/content";
import { getShopifyProductsByHandles } from "@/lib/shopify";
import FormRenderer from "@/components/renderers/formRenderer";
import { pageHead } from "@/lib/seo.ts";
import type { ComponentFormPaintingField, FormProps } from "@/hooks/useFormControl.ts";

const PAGE_SLUG = "prints"

export const Route = createFileRoute('/prints')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            painting: search.painting ? String(search.painting) : undefined
        }
    },
    component: RouteComponent,
    loader: async ({ context }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ["page", PAGE_SLUG],
            queryFn: () => getPage(PAGE_SLUG),
        })
        const form = formFromPage(page)

        // The painting picker's options: its collection's products, narrowed to
        // those with at least one print variant for sale on Shopify.
        const pickerField = form.fields.find((f) => f.metadata.fieldType === "painting") as ComponentFormPaintingField | undefined
        const products = pickerField?.collection
            ? (await context.queryClient.ensureQueryData({
                queryKey: ["collection", pickerField.collection, ""],
                queryFn: () => getCollection(pickerField.collection!),
            })).products
            : []

        const handles = products
            .map((product) => product.shopifyHandle)
            .filter((handle): handle is string => !!handle)

        const shopByHandle = handles.length > 0
            ? await context.queryClient.ensureQueryData({
                queryFn: () => getShopifyProductsByHandles({ data: { handles } }),
                queryKey: ["shopifyProducts", handles.join(",")]
            })
            : {}

        const paintings = products
            .filter((product) => product.shopifyHandle && shopByHandle[product.shopifyHandle]?.prints.some((print) => print.availableForSale))
            .map(({ slug, title, image, category, dateCreated }) => ({ slug, title, image, category, dateCreated }))

        const printForm: FormProps = {
            ...form,
            fields: form.fields.map((field) =>
                field.metadata.fieldType === 'painting' ? { ...field, paintings } : field
            )
        }

        return { form: printForm, seo: toPageSeo(page.seo) }
    },
    head: ({ loaderData }) => pageHead(loaderData?.seo),
})

function RouteComponent() {
    const { form } = Route.useLoaderData()
    const { painting } = Route.useSearch()

    const pickerField = form.fields.find((f) => f.metadata.fieldType === "painting") as ComponentFormPaintingField | undefined
    // Only preselect slugs that match a selectable painting, so a stale link
    // can't satisfy the required field with a value no card represents.
    const preselected = painting && pickerField?.paintings?.some((p) => p.slug === painting) ? painting : undefined
    return (
        <div>
            <FormRenderer
                key={preselected ?? "none"}
                type={"layout"}
                form={form}
                initialValues={preselected && pickerField ? { [pickerField.id]: preselected } : undefined}
            >
            </FormRenderer>
        </div>
    )
}

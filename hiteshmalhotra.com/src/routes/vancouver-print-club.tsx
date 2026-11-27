import { createFileRoute } from '@tanstack/react-router'
import { getShopifySubscription } from "@/lib/shopify";
import { getPage, toPageSeo } from "@/lib/content";
import { pageHead } from "@/lib/seo.ts";
import PrintClubLayout from "@/layouts/printClub";

const PAGE_SLUG = "vancouver-print-club"

export const Route = createFileRoute('/vancouver-print-club')({
    component: RouteComponent,
    loader: async ({ context }) => {
        const page = await context.queryClient.ensureQueryData({
            queryKey: ["page", PAGE_SLUG],
            queryFn: () => getPage(PAGE_SLUG),
        })
        const block = page.blocks.find((b) => b.type === "printClub")
        if (block?.type !== "printClub") throw new Error(`Page '${PAGE_SLUG}' has no printClub block`)

        const subscription = await context.queryClient.ensureQueryData({
            queryFn: () => getShopifySubscription({ data: { handle: block.subscriptionHandle } }),
            queryKey: ["shopifySubscription", block.subscriptionHandle]
        })
        return { page, block, subscription, seo: toPageSeo(page.seo) }
    },
    head: ({ loaderData }) => pageHead(loaderData?.seo),
})

function RouteComponent() {
    const { page, block, subscription } = Route.useLoaderData()
    return (
        <div>
            <PrintClubLayout
                title={page.layout?.title ?? ""}
                description={page.layout?.description ?? ""}
                block={block}
                subscription={subscription}
            ></PrintClubLayout>
        </div>
    )
}

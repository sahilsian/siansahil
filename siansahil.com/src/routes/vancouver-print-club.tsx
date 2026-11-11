import { createFileRoute } from '@tanstack/react-router'
import {getShopifySubscription} from "@/lib/shopify";
import PrintClubLayout from "@/layouts/printClub";

const SUBSCRIPTION_HANDLE = "vancouver-print-club"

export const Route = createFileRoute('/vancouver-print-club')({
    component: RouteComponent,
    loader: async ({context}) => {
        const subscription = await context.queryClient.ensureQueryData({
            queryFn: () => getShopifySubscription({ data: { handle: SUBSCRIPTION_HANDLE } }),
            queryKey: ["shopifySubscription", SUBSCRIPTION_HANDLE]
        })
        return {
            subscription
        }
    },
    head: () => {
        return {
            meta: [
                { title: "Vancouver City Print Club — Sahil Sian" },
                { name: "description", content: "Join the Vancouver City Print Club for $19 a month." },
                { property: 'og:title', content: "Vancouver City Print Club — Sahil Sian" },
                { property: 'og:description', content: "Join the Vancouver City Print Club for $19 a month." },
                { property: 'og:type', content: "website" }
            ]
        }
    }
})

function RouteComponent() {
    const { subscription } = Route.useLoaderData()
    return (
        <div>
            <PrintClubLayout subscription={subscription}></PrintClubLayout>
        </div>
    )
}

import { createFileRoute } from '@tanstack/react-router';
import { getPage, toButton, toPageSeo } from "@/lib/content";
import BlockRenderer from "@/components/renderers/blockRenderer";
import { pageHead } from "@/lib/seo.ts";

const HOME_SLUG = "home"

export const Route = createFileRoute('/')(
    {
        loader: async ({ context }) => {
            const page = await context.queryClient.ensureQueryData({
                queryKey: ['page', HOME_SLUG],
                queryFn: () => getPage(HOME_SLUG),
            })
            return { page }
        },
        head: ({ loaderData }) => pageHead(loaderData && toPageSeo(loaderData.page.seo)),
        component: HomePage
    }
)

function HomePage() {
    const { page } = Route.useLoaderData();
    // Map server blocks onto the BlockRenderer's existing block props.
    const blocks = page.blocks.flatMap((block, i) =>
        block.type === "hero"
            ? [{
                id: i,
                variation: { variation: "hero" },
                title: block.title,
                description: block.description,
                primary: toButton(block.primary, 1),
                secondary: toButton(block.secondary, 2),
                hero_image: block.heroImage,
                hero_video: block.heroVideo,
                profile_image: block.profileImage,
            }]
            : []
    )
    return (
        <div>
            <BlockRenderer blocks={blocks} />
        </div>
    )
}

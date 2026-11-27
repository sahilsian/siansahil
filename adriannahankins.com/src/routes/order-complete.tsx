import { createFileRoute, Link } from '@tanstack/react-router'
import PageLayout from "@/layouts/page";
import { useSite } from "@/contexts/site/siteContext.tsx";
import { getFontStyles } from "@/components/typography/fonts.ts";

// /order-complete: where Stripe sends buyers after they pay for a print (the payment
// link's redirect). Stripe emails the receipt; the artist is notified separately.
export const Route = createFileRoute('/order-complete')({
    head: () => ({ meta: [{ title: "Thank you for your order" }, { name: "robots", content: "noindex" }] }),
    component: RouteComponent,
})

function RouteComponent() {
    const { labels } = useSite()
    return (
        <PageLayout
            title={labels.orderThanksTitle ?? "Thank you for your order"}
            description={labels.orderThanksBody ?? "Your payment went through and a receipt is on its way to your email. You'll hear from us when your print ships."}
        >
            <p className={getFontStyles("p")}>
                <Link to={"/prints"} className={"underline text-[var(--color-link)] hover:text-[var(--color-link-hover)]"}>
                    {labels.prints ?? "Prints"}
                </Link>
            </p>
        </PageLayout>
    )
}

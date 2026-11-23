import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import {Media} from "@/layouts/product/media.tsx";
import TabbedContent, {Tab} from "@/components/tabbedContent";
import {Link} from "@tanstack/react-router";
import {StrapiImage} from "@/components/image";
import {useAppState} from "@/hooks/useAppState.ts";
import Spinner from "@/components/spinner";
import Breadcrumb from "@/components/breadcrumb";
import {useSite} from "@/contexts/site/siteContext.tsx";
import type {ArtworkStore, Availability} from "@/lib/api/types.ts";
import {forSale} from "@/lib/store";
import InquiryButton from "@/components/inquiryDialog";

interface ContentProps {
    type?: string;
    title: string;
    slug?: string;
    image: StrapiImage;
    images?: StrapiImage[];
    description: string;
    tabs?: Tab[];
    dateCreated?: string;
    material?: string;
    store?: ArtworkStore;
    availability?: Availability;
}

export const Content = ({title, slug, description, image, images = [], tabs, store, availability}:ContentProps) => {
    const ctx = useAppState()
    const { labels, currency } = useSite()
    const sale = forSale(store, currency)

    // The original's status: from the store when it's listed there, otherwise the
    // availability set on the artwork (e.g. sold privately).
    const status = sale.originalAvailable ? "available" : availability?.status
    const price = !sale.originalAvailable && availability?.status === "available" ? availability.price : undefined

    return (
        <div className={"Product relative z-30"}>
            <Breadcrumb items={[
                { label: labels.gallery ?? "Gallery", to: "/products", search: { collection: "gallery", title: undefined } },
                { label: title },
            ]} />
            <Spacer height={"10px"}></Spacer>
            <div className={"flex gap-10 flex-wrap"}>
                <div className={'flex-1'}>
                    <Media images={[image, ...images]}></Media>
                </div>

                <div className={"flex-2"}>
                    <div className={'flex items-center gap-3'}>
                        <Typography value={title} level={"2"}></Typography>
                        <div className={''}>
                            {ctx.isProcessing && <Spinner></Spinner>}
                        </div>
                    </div>
                    <Typography level={"p"} value={description}></Typography>

                    {status && (
                        <div className={"flex items-center justify-between gap-4 flex-wrap border border-[var(--color-border)] px-4 py-3 mt-5"}>
                            <div className={"flex items-center gap-4"}>
                                {price && <Typography level={"6"} value={price} />}
                                {status === "available" && (
                                    <span className={"font-serif text-[1rem] text-[var(--color-available)]"}>{labels.available}</span>
                                )}
                                {status === "sold" && (
                                    <span className={"font-serif text-[1rem] text-[var(--color-sold)]"}>{labels.sold}</span>
                                )}
                                {status === "unavailable" && (
                                    <Typography secondary level={"6"} value={availability?.label ?? labels.unavailable} />
                                )}
                            </div>
                            {status === "available" && (
                                <InquiryButton
                                    title={title}
                                    label={labels.inquire}
                                    className={"font-serif text-[1rem] font-bold underline"}
                                />
                            )}
                        </div>
                    )}

                    <Spacer height={"20px"}></Spacer>
                    <div>
                        <TabbedContent tabs={tabs}></TabbedContent>
                    </div>
                    {slug && sale.prints.length > 0 && (
                        <Link
                            to={"/products/$slug/prints"}
                            params={{ slug }}
                            className={"inline-block mt-6 rounded-md border border-[var(--color-border)] px-3 py-1.5 font-serif text-[0.95rem] transition-colors hover:bg-[var(--color-hover)]"}
                        >
                            {labels.availableInPrints ?? "This item is available in prints"}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    )
}

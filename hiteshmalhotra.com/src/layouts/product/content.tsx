import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import {Media} from "@/layouts/product/media.tsx";
import TabbedContent, {Tab} from "@/components/tabbedContent";
import {Link} from "@tanstack/react-router";
import {StrapiImage} from "@/components/image";
import {useAppState} from "@/hooks/useAppState.ts";
import Spinner from "@/components/spinner";
import Breadcrumb from "@/components/breadcrumb";
import InquiryButton from "@/components/inquiryDialog";
import type {ArtworkStore, Availability, PrintLink} from "@/lib/api/types.ts";
import {forSale} from "@/lib/store";
import {getFontStyles} from "@/components/typography/fonts.ts";
import {getButtonType} from "@/components/routerButton/button.ts";
import {useSite} from "@/contexts/site/siteContext.tsx";

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
    /** Prints of this painting (each its own listing on /prints). */
    prints?: PrintLink[];
    /** Set on works sold off-platform: status and an optional display price. */
    availability?: Availability;
}

// Colours from the site theme (colors.link / colors.linkHover).
const LINK_CLASS = "underline text-[var(--color-link)] hover:text-[var(--color-link-hover)]"

export const Content = ({title, description, image, images = [], tabs, store, prints = [], availability}:ContentProps) => {
    const ctx = useAppState()
    const { labels, currency, theme } = useSite()
    const originalAvailable = forSale(store, currency).originalAvailable
    const forSaleText = (prints.length > 0 || originalAvailable)
        ? <ForSaleText title={title} prints={prints} originalAvailable={originalAvailable} />
        : undefined

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
                    {availability && <AvailabilityBox title={title} availability={availability} />}
                    {/* Sites where every item can be inquired about (e.g. events to book), unless the box above already offers it. */}
                    {theme.itemInquiry && availability?.status !== "available" && (
                        <div className={"mt-5"}>
                            <InquiryButton
                                kind={"item"}
                                title={title}
                                label={labels.inquire}
                                className={`${getButtonType("primary")} font-serif text-[1rem]`}
                            />
                        </div>
                    )}
                    <Spacer height={"20px"}></Spacer>
                    <div>
                        <TabbedContent tabs={tabs} header={forSaleText}></TabbedContent>
                    </div>
                </div>
            </div>
        </div>
    )
}

/** Price and Available / Sold / Unavailable (with Inquire when available), from the artwork's availability. */
function AvailabilityBox({title, availability}: { title: string; availability: Availability }) {
    const { labels } = useSite()
    const { status, price, label } = availability
    return (
        <div className={"flex items-center justify-between gap-4 flex-wrap border border-[var(--color-border)] px-4 py-3 mt-5"}>
            <div className={"flex items-center gap-4"}>
                {status === "available" && price && <Typography level={"6"} value={price} />}
                {status === "available" && (
                    <span className={"font-serif text-[1rem] text-[var(--color-available)]"}>{labels.available}</span>
                )}
                {status === "sold" && (
                    <span className={"font-serif text-[1rem] text-[var(--color-sold)]"}>{labels.sold}</span>
                )}
                {status === "unavailable" && (
                    <Typography secondary level={"6"} value={label ?? labels.unavailable} />
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
    )
}

/**
 * This item is available in prints
 *   • Mount Pleasant | Archival Limited Edition 24 x 36 15 copies   (links to the print's page)
 * This item is also available for original, inquire
 */
function ForSaleText({title, prints, originalAvailable}: { title: string; prints: PrintLink[]; originalAvailable: boolean }) {
    const { labels } = useSite()
    const copies = labels.copies ?? "copies"
    return (
        <div className={`space-y-3 ${getFontStyles("p")}`}>
            {prints.length > 0 && (
                <div>
                    <p>{labels.availableInPrints ?? "This item is available in prints"}</p>
                    <ul className={"mt-1 list-disc pl-6 space-y-0.5"}>
                        {prints.map((print) => (
                            <li key={print.slug}>
                                <Link to={"/prints/$slug"} params={{ slug: print.slug }} className={LINK_CLASS}>
                                    {`${title} | ${print.title} ${print.sizeLabel}`}
                                    {print.editionSize ? ` ${print.editionSize} ${copies}` : ""}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {originalAvailable && (
                <p>
                    {prints.length > 0
                        ? (labels.originalAlsoAvailable ?? "This item is also available for original,")
                        : (labels.originalAvailableNote ?? "This original is available,")}{" "}
                    <InquiryButton
                        title={title}
                        label={(labels.inquire ?? "Inquire").toLowerCase()}
                        className={`${LINK_CLASS} cursor-pointer`}
                    />
                </p>
            )}
        </div>
    )
}

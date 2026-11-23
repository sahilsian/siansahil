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
import type {ArtworkStore, PrintLink} from "@/lib/api/types.ts";
import {forSale} from "@/lib/store";
import {getFontStyles} from "@/components/typography/fonts.ts";
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
}

const LINK_CLASS = "underline text-[#2563EB] hover:text-[#1D4ED8]"

export const Content = ({title, description, image, images = [], tabs, store, prints = []}:ContentProps) => {
    const ctx = useAppState()
    const { labels, currency } = useSite()
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
                    <Spacer height={"20px"}></Spacer>
                    <div>
                        <TabbedContent tabs={tabs} header={forSaleText}></TabbedContent>
                    </div>
                </div>
            </div>
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

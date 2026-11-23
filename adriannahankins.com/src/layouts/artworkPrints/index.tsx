import Typography from "@/components/typography";
import TabbedContent from "@/components/tabbedContent";
import Breadcrumb from "@/components/breadcrumb";
import {Background} from "@/layouts/collection/background.tsx";
import {useSite} from "@/contexts/site/siteContext.tsx";
import {Product} from "@/lib/data/interfaces.ts";
import {forSale} from "@/lib/store";
import {PrintCarousel} from "./carousel.tsx";
import InquiryButton from "@/components/inquiryDialog";

/**
 * "<Artwork> Prints": the artwork's print sizes in a carousel (gallery-style cards),
 * whether the original is also available, then the artwork's description.
 */
const ArtworkPrintsLayout = ({product}: {product: Product}) => {
    const {labels, currency, locale} = useSite();
    const sale = forSale(product.store, currency);
    const printsWord = labels.prints ?? "Prints";
    const inquire = labels.inquire ?? "Inquire";

    return (
        <div className={"Collection lg:px-22 px-6 pb-22 bg-[var(--color-surface)] relative min-h-screen"}>
            <Background></Background>
            <div className={"relative z-20 py-22 pb-6 space-y-3"}>
                <Breadcrumb items={[
                    { label: labels.gallery ?? "Gallery", to: "/products", search: { collection: "gallery", title: undefined } },
                    { label: product.title, to: "/products/$slug", params: { slug: product.slug } },
                    { label: printsWord },
                ]} />
                <Typography level={"3"} value={`${product.title} ${printsWord}`} />
                {sale.originalAvailable && (
                    <div>
                        <p className={"font-serif text-[1.1rem] font-medium text-[#7FB2F0]"}>
                            {labels.originalAvailable ?? "Original Available"}
                        </p>
                        <p className={"font-serif text-[1rem]"}>
                            {labels.originalAvailableNote ?? "This original is available,"}{" "}
                            <InquiryButton title={product.title} label={inquire.toLowerCase()} className={"underline"} />.
                        </p>
                    </div>
                )}
            </div>

            <div className={"relative z-20"}>
                {sale.prints.length > 0 ? (
                    <PrintCarousel image={product.image} prints={sale.prints} currency={sale.currency} locale={locale} inquireLabel={inquire} />
                ) : (
                    <Typography level={"p"} value={labels.noPrintablePaintings} />
                )}
            </div>

            <div className={"relative z-20 mt-12 max-w-3xl space-y-6"}>
                <Typography level={"p"} value={product.description} />
                <TabbedContent tabs={product.tabs} />
            </div>
        </div>
    );
};

export default ArtworkPrintsLayout;

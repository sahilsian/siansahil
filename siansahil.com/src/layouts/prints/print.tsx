import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Breadcrumb from "@/components/breadcrumb";
import RichText from "@/components/richText";
import InquiryButton from "@/components/inquiryDialog";
import Background from "@/layouts/product/background.tsx";
import {Media} from "@/layouts/product/media.tsx";
import {useSite} from "@/contexts/site/siteContext.tsx";
import {formatPrice} from "@/lib/store";
import {getFontStyles} from "@/components/typography/fonts.ts";
import type {PrintDoc} from "@/lib/api/types.ts";
import {printListName} from "./list.tsx";

const BUTTON_CLASS = "inline-block rounded-md border border-[var(--color-border)] px-5 py-2 font-serif text-[1rem] transition-colors hover:bg-[var(--color-button-bg)] hover:text-[var(--color-button-text)] cursor-pointer"

/** One print: photos, name, price, edition, description and Buy (Stripe checkout). */
const PrintLayout = ({print}: {print: PrintDoc}) => {
    const {labels, locale} = useSite();
    const name = printListName(print);
    const images = print.images.length > 0 ? print.images : print.artwork.image ? [print.artwork.image] : [];
    const copies = labels.copies ?? "copies";

    return (
        <div className={'p-6 md:px-22 py-22 relative'}>
            <Background></Background>
            <div className={"relative z-30"}>
                <Breadcrumb items={[
                    { label: labels.prints ?? "Prints", to: "/prints" },
                    { label: name },
                ]} />
                <Spacer height={"10px"}></Spacer>
                <div className={"flex gap-10 flex-wrap"}>
                    <div className={"flex-1"}>
                        <Media images={images}></Media>
                    </div>
                    <div className={"flex-2 space-y-4"}>
                        <Typography level={"2"} value={name} />
                        <div className={getFontStyles("p")}>
                            <p className={"text-[1.6rem] md:text-[2.2rem] font-semibold leading-tight mb-1"}>
                                {formatPrice(print.priceCents, print.currency.toUpperCase(), locale)}
                            </p>
                            <p>
                                {print.sizeLabel} in
                                {print.editionSize ? ` · ${labels.limitedEdition ?? "Limited edition of"} ${print.editionSize} ${copies}` : ""}
                            </p>
                        </div>
                        {/* Extra room under Buy / Inquire before the description. */}
                        <div className={"pb-8"}>
                            {print.soldOut ? (
                                <p className={`${getFontStyles("p")} font-semibold text-[var(--color-sold)]`}>{labels.soldOut ?? "Sold out"}</p>
                            ) : print.comingSoon ? (
                                <span aria-disabled={"true"} className={`${BUTTON_CLASS} cursor-not-allowed opacity-60 hover:bg-transparent hover:text-inherit`}>
                                    {labels.comingSoon ?? "Coming soon"}
                                </span>
                            ) : print.buyUrl ? (
                                <a href={print.buyUrl} className={BUTTON_CLASS}>{labels.buy ?? "Buy"}</a>
                            ) : (
                                <InquiryButton title={name} kind={"print"} label={labels.inquire ?? "Inquire"} className={BUTTON_CLASS} />
                            )}
                        </div>
                        {print.description && <RichText richText={print.description} />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrintLayout;

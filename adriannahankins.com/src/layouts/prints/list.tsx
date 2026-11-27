import {Link} from "@tanstack/react-router";
import Image from "@/components/image";
import Typography from "@/components/typography";
import {useSite} from "@/contexts/site/siteContext.tsx";
import {formatPrice} from "@/lib/store";
import type {PrintDoc} from "@/lib/api/types.ts";

/** The print's own first photo, else its painting's. */
export const printImage = (print: PrintDoc) => print.images[0] ?? print.artwork.image ?? undefined;

/** "Mount Pleasant - Archival Limited Edition 24 x 36" */
export const printListName = (print: PrintDoc) => `${print.artwork.title} - ${print.title} ${print.sizeLabel}`;

/** Gallery-style cards: photo, "Painting - Print size" and the price. */
const PrintList = ({prints}: {prints: PrintDoc[]}) => {
    const {labels, locale} = useSite();
    if (prints.length === 0) {
        return <Typography level={"p"} value={labels.noPrints ?? "No prints are available right now."} />;
    }
    return (
        <div className={"grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"}>
            {prints.map((print) => {
                const image = printImage(print);
                return (
                    <Link key={print.slug} to={"/prints/$slug"} params={{slug: print.slug}} className={"group flex flex-col gap-3"}>
                        <div className={"aspect-square overflow-hidden bg-black/5"}>
                            {image && <Image image={image} className={"h-full w-full object-cover transition-opacity group-hover:opacity-90"} />}
                        </div>
                        <div>
                            <Typography underline level={"4"} value={printListName(print)} />
                            <Typography secondary level={"small"} value={formatPrice(print.priceCents, print.currency.toUpperCase(), locale)} />
                        </div>
                    </Link>
                );
            })}
        </div>
    );
};

export default PrintList;

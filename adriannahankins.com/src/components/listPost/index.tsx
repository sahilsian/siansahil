import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import {RouterInjectedProps} from "@/decorators/withRouter";
import type {ArtworkStore, Availability} from "@/lib/api/types.ts";
import {getListingAvailability} from "@/lib/productAvailability";
import {forSale} from "@/lib/store";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface PostProps {
    title: string;
    description: string;
    image: StrapiImage;
    slug: string;
    clickable: boolean;
    disabled?: boolean
    category?: string
    store?: ArtworkStore;
    availability?: Availability;
}

const ListPost =
    ({ disabled, clickable, slug, title, description, image, goToPost, store, availability}: PostProps & RouterInjectedProps
    ) => {
        const handleClick = () => {
            if (clickable) {
                goToPost(slug);
            }
        };

        const { currency, locale } = useSite();
        const {originalStatus, printsFromLabel, unavailable} = getListingAvailability(forSale(store, currency), availability, locale);

        return (
            <div
                onClick={handleClick}
                className={`
                 flex-1
                 w-full
                 border-1 border-[var(--color-border)]
                 hover:bg-[var(--color-hover)]
                 transition-all
                 flex
                 lg:gap-10
                 gap-4
                 ${disabled && "bg-[var(--color-disabled)] text-[var(--color-muted)]"}
                 rounded-4xl transition-all p-6  mb-6 ${
                    clickable ? "cursor-pointer" : ""
                }`}
            >
                <div className={"flex-1 max-w-[150px]"}>
                    <Image image={image} className={'rounded-2xl w-full aspect-square object-cover object-top'} />
                </div>
                <div className={"flex-1"}>
                    <div className={'flex items-baseline gap-2 flex-wrap'}>
                        <Typography underline level={"3"} value={title} />
                       
                    </div>
                    <Typography level={"p"} value={description} className={"line-clamp-3"} />
                    <div className={'flex items-center justify-between mt-2'}>
                        <div>
                            {printsFromLabel && <Typography level={"small"} value={`Prints from: ${printsFromLabel}`} />}
                        </div>
                        <div>
                            {unavailable && <Typography secondary level={"small"} value={"Unavailable"} />}
                        </div>
                    </div>
                     {originalStatus && (
                            <span className={`font-serif text-[0.8rem] lg:text-[1.75rem] font-medium ${originalStatus === "available" ? "text-[var(--color-available)]" : "text-[var(--color-sold)]"}`}>
                                {originalStatus === "available" ? "Available" : "Sold"}
                            </span>
                        )}
                </div>

            </div>
        );
    };

export default ListPost;

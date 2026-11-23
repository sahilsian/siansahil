import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import {RouterInjectedProps} from "@/decorators/withRouter";
import type {ArtworkStore, Availability} from "@/lib/api/types.ts";
import {cardPriceLabel} from "@/lib/store";
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
    ({ disabled, clickable, slug, title, description, image, goToPost, availability}: PostProps & RouterInjectedProps
    ) => {
        const handleClick = () => {
            if (clickable) {
                goToPost(slug);
            }
        };

        // The artwork's price, or "Unavailable".
        const { labels } = useSite();
        const price = cardPriceLabel(availability, labels);

        return (
            <div
                onClick={handleClick}
                className={`
                 flex-1
                 w-full
                 border-1 border-[#000000]
                 hover:bg-[#ffffff]
                 transition-all
                 flex
                 lg:gap-10
                 gap-4
                 ${disabled && "bg-[#E3E3E3] text-gray-500"}
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
                    <div className={'mt-2'}>
                        <Typography secondary level={"small"} value={price} />
                    </div>
                </div>

            </div>
        );
    };

export default ListPost;

import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import {RouterInjectedProps} from "@/decorators/withRouter";
import {ShopifyProductData} from "@/lib/shopify";
import {getListingAvailability} from "@/lib/productAvailability";

interface PostProps {
    title: string;
    description: string;
    image: StrapiImage;
    slug: string;
    clickable: boolean;
    disabled?: boolean
    category?: string
    shop?: ShopifyProductData | null;
}

const ListPost =
    ({ disabled, clickable, slug, title, description, image, goToPost, shop}: PostProps & RouterInjectedProps
    ) => {
        const handleClick = () => {
            if (clickable) {
                goToPost(slug);
            }
        };

        const {originalStatus, printsFromLabel, unavailable} = getListingAvailability(shop);

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
                    <div className={'flex items-center justify-between mt-2'}>
                        <div>
                            {printsFromLabel && <Typography level={"small"} value={`Prints from: ${printsFromLabel}`} />}
                        </div>
                        <div>
                            {unavailable && <Typography secondary level={"small"} value={"Unavailable"} />}
                        </div>
                    </div>
                     {originalStatus && (
                            <span className={`font-serif text-[0.8rem] lg:text-[1.75rem] font-medium ${originalStatus === "available" ? "text-[#4e9e39]" : "text-[#c44b57]"}`}>
                                {originalStatus === "available" ? "Available" : "Sold"}
                            </span>
                        )}
                </div>

            </div>
        );
    };

export default ListPost;

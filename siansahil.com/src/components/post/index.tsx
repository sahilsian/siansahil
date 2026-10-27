import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
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
    category: string;
    dateCreated?: string
    material?: string;
    shop?: ShopifyProductData | null;
}

const Post =
    ({ disabled, clickable, slug, title, description, image, goToPost, category, material, dateCreated, shop}: PostProps & RouterInjectedProps
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
                max-w-[500px] flex-1
                 border-1 border-[#000000]
                 hover:bg-[#ffffff]
                 transition-all
                 ${disabled && "bg-[#E3E3E3] text-gray-500"}
                 rounded-4xl transition-all p-6 lg:min-w-[380px]  min-w-[340px] mb-6 ${
                clickable ? "cursor-pointer" : ""
            }`}
        >   
            
            <Image image={image} className={'rounded-2xl w-full aspect-square object-cover object-top'} />
            <Spacer height={"20px"} />
            <div className={'mb-2'}>
                <Typography underline level={"3"} value={title} />

                <div className={'flex gap-3'}>
                    <Typography secondary level={"6"} value={String(category[0]).toUpperCase() + String(category).slice(1)} />

                    {dateCreated &&<>
                        <Typography secondary level={"6"} value={"|"} />
                        <Typography secondary level={"6"} value={dateCreated} />
                    </>}
                    {material &&<>
                        <Typography secondary level={"6"} value={"|"} />
                        <Typography secondary level={"6"} value={material} />
                    </>}
                </div>
            </div>
            <Typography level={"p"} value={description} className={"line-clamp-3"} />
            <div className={'flex gap-2 mt-2'}>
                    {printsFromLabel && <Typography level={"small"} value={`Prints from: ${printsFromLabel}`} />}
                    {unavailable && <Typography secondary level={"small"} value={"Unavailable"} />}
                    {originalStatus && (
                        <div className={`font-serif text-[0.8rem]  font-medium ${originalStatus === "available" ? "text-[#4e9e39]" : "text-[#c44b57]"}`}>
                            {originalStatus === "available" ? "Original Available" : "Original Sold"}
                        </div>
                    )}
            </div>
        </div>
    );
};

export default Post;

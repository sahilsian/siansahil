import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import {RouterInjectedProps} from "@/decorators/withRouter";
import {formatShopifyPrice, ShopifyProductData} from "@/lib/shopify";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface PostProps {
    title: string;
    image: StrapiImage;
    slug: string;
    clickable: boolean;
    disabled?: boolean
    // Cards per row on laptop+ (lg); widths subtract the gap-6 (1.5rem) gaps.
    columns?: 3 | 4
    shop?: ShopifyProductData | null
}

// Square card: the image fills whatever height the title row leaves.
const Post =
    ({ disabled, clickable, slug, title, image, goToPost, columns = 3, shop}: PostProps & RouterInjectedProps
    ) => {
    const handleClick = () => {
        if (clickable) {
            goToPost(slug);
        }
    };

    // Price of the original painting; anything not for sale (sold, no Shopify
    // listing, or Shopify unreachable) reads as unavailable.
    const { labels } = useSite();
    const original = shop?.original;
    const price = original?.availableForSale
        ? formatShopifyPrice(original.price, original.currencyCode)
        : labels.unavailable;

    return (
        <div
            onClick={handleClick}
            className={`
                w-full md:w-[calc((100%-1.5rem)/2)]
                ${columns === 4 ? "lg:w-[calc((100%-4.5rem)/4)]" : "lg:w-[calc((100%-3rem)/3)]"}
                aspect-square flex flex-col gap-4
                ${disabled ? "bg-[#E3E3E3] text-gray-500" : ""}
                ${clickable ? "cursor-pointer" : ""}
            `}
        >
            <Image image={image} className={'w-full flex-1 min-h-0 object-cover object-top'} />
            <div>
                <Typography underline level={"4"} value={title} />
                <Typography secondary level={"small"} value={price} />
            </div>
        </div>
    );
};

export default Post;

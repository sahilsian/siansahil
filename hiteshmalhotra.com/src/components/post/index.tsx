import Image, { StrapiImage } from "@/components/image";
import Typography from "@/components/typography";
import {RouterInjectedProps} from "@/decorators/withRouter";
import type {ArtworkStore, Availability} from "@/lib/api/types.ts";
import {cardStatusLabel, forSale} from "@/lib/store";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface PostProps {
    title: string;
    image: StrapiImage;
    slug: string;
    clickable: boolean;
    disabled?: boolean
    // Cards per row on laptop+ (lg); widths subtract the gap-6 (1.5rem) gaps.
    columns?: 3 | 4
    store?: ArtworkStore
    availability?: Availability
}

// Square card: the image fills whatever height the title row leaves.
const Post =
    ({ disabled, clickable, slug, title, image, goToPost, columns = 3, store, availability}: PostProps & RouterInjectedProps
    ) => {
    const handleClick = () => {
        if (clickable) {
            goToPost(slug);
        }
    };

    // Price / Sold / Unavailable under the title, when the site shows it (theme.galleryStatus).
    const site = useSite();
    const status = site.theme.galleryStatus !== false
        ? cardStatusLabel(forSale(store, site.currency), availability, site.labels)
        : null;

    return (
        <div
            onClick={handleClick}
            className={`
                w-full md:w-[calc((100%-1.5rem)/2)]
                ${columns === 4 ? "lg:w-[calc((100%-4.5rem)/4)]" : "lg:w-[calc((100%-3rem)/3)]"}
                aspect-square flex flex-col gap-4
                ${disabled ? "bg-[var(--color-disabled)] text-[var(--color-muted)]" : ""}
                ${clickable ? "cursor-pointer" : ""}
            `}
        >
            <Image image={image} className={'w-full flex-1 min-h-0 object-cover object-top'} />
            <div>
                <Typography underline level={"4"} value={title} />
                {status && <Typography secondary level={"small"} value={status} />}
            </div>
        </div>
    );
};

export default Post;

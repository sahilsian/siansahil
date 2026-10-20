export interface StrapiImage {
    url: string;
    width: number;
    height: number;
    alternativeText?: string | null;
    caption?: string | null;
    name: string;
}

interface ImageProps {
    image: StrapiImage;
    className?: string;
    objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
    objectPosition?: "top" | "right" | "bottom" | "left";
}

const toImageProps = (img: StrapiImage) => {
    return {
        src: img.url,
        width: img.width,
        height: img.height,
        alt: img.alternativeText || img.caption || img.name,
    };
};

const Image = ({
                   image,
                   objectFit = "cover",
                   objectPosition = "top",
                   className = "IMG"
               }: ImageProps) => {

    const props = toImageProps(image);
    return (
        <img
            className={className}
            style={{ objectFit, objectPosition }}
            {...props}
        />
    );
};

export default Image;
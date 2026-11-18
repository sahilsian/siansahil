import {useState} from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import Image, {StrapiImage} from "@/components/image";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface MediaProps {
    // First image is the main one; any others show as thumbnails underneath.
    images: StrapiImage[]
}

export const Media = ({images}:MediaProps) => {
    const [selected, setSelected] = useState(0);
    const { labels } = useSite();
    // Index of the slide open in the lightbox, or -1 when closed.
    const [lightboxIndex, setLightboxIndex] = useState(-1);

    if (images.length === 0) return null;

    const current = images[selected] ?? images[0];

    return (
        <div className={"flex-1"}>
            <button
                type={"button"}
                onClick={() => setLightboxIndex(selected)}
                className={"block w-full cursor-zoom-in"}
                aria-label={labels.enlargeImage}
            >
                <Image className={"min-w-[320px] w-full"} image={current}></Image>
            </button>

            {images.length > 1 && (
                <div className={"flex flex-wrap gap-2 mt-3"}>
                    {images.map((image, index) => (
                        <button
                            type={"button"}
                            key={image.url}
                            onClick={() => setSelected(index)}
                            aria-label={`${labels.showImage} ${index + 1}`}
                            aria-current={index === selected}
                            className={`w-12 h-12 cursor-pointer ${index === selected ? "outline-2 outline-black outline-offset-2" : "opacity-70 hover:opacity-100"}`}
                        >
                            <Image className={"w-full h-full"} image={image}></Image>
                        </button>
                    ))}
                </div>
            )}

            <Lightbox
                open={lightboxIndex >= 0}
                index={Math.max(lightboxIndex, 0)}
                close={() => setLightboxIndex(-1)}
                // Keep the page's main image in sync with what was last viewed.
                on={{ view: ({index}) => { if (lightboxIndex >= 0) setSelected(index) } }}
                slides={images.map((image) => ({
                    src: image.url,
                    width: image.width,
                    height: image.height,
                    alt: image.alternativeText || image.name,
                }))}
                plugins={images.length > 1 ? [Zoom, Counter] : [Zoom]}
                zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
                carousel={{ finite: images.length <= 1 }}
                render={images.length <= 1 ? { buttonPrev: () => null, buttonNext: () => null } : undefined}
                controller={{ closeOnBackdropClick: true }}
            />
        </div>
    )
}

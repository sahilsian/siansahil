import {useEffect, useRef, useState} from "react";
import {Link} from "@tanstack/react-router";
import Image, {StrapiImage} from "@/components/image";
import Typography from "@/components/typography";
import {formatPrice} from "@/lib/store";

export interface PrintCard {
    sizeId: string;
    label: string;
    priceCents: number;
}

interface PrintCarouselProps {
    image: StrapiImage;
    prints: PrintCard[];
    currency: string;
    locale?: string;
    inquireLabel: string;
}

/** Print sizes as gallery-style square cards in a horizontal, swipeable row. */
export const PrintCarousel = ({image, prints, currency, locale, inquireLabel}: PrintCarouselProps) => {
    const track = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({start: true, end: true});

    const measure = () => {
        const el = track.current;
        if (!el) return;
        setEdges({start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2});
    };
    useEffect(() => {
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [prints.length]);

    const scroll = (direction: 1 | -1) => {
        const el = track.current;
        if (el) el.scrollBy({left: direction * el.clientWidth * 0.9, behavior: "smooth"});
    };

    return (
        <div className={"relative"}>
            <div
                ref={track}
                onScroll={measure}
                className={"flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 [scrollbar-width:thin]"}
            >
                {prints.map((print) => (
                    <div
                        key={print.sizeId}
                        className={"snap-start shrink-0 w-[80%] md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] aspect-square flex flex-col gap-4"}
                    >
                        <Image image={image} className={"w-full flex-1 min-h-0 object-cover object-top"} />
                        <div className={"flex items-end justify-between gap-3"}>
                            <div>
                                <Typography underline level={"4"} value={print.label} />
                                <Typography secondary level={"small"} value={formatPrice(print.priceCents, currency, locale)} />
                            </div>
                            {/* Checkout (Stripe) comes later; until then prints are bought by inquiry. */}
                            <Link to={"/contact"} className={"font-serif text-[1rem] underline"}>
                                {inquireLabel}
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
            {!edges.start && (
                <button
                    type="button"
                    aria-label="Previous sizes"
                    onClick={() => scroll(-1)}
                    className={"hidden md:flex absolute left-0 top-[40%] -translate-x-1/2 size-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-page)] font-serif text-xl"}
                >
                    ‹
                </button>
            )}
            {!edges.end && (
                <button
                    type="button"
                    aria-label="More sizes"
                    onClick={() => scroll(1)}
                    className={"hidden md:flex absolute right-0 top-[40%] translate-x-1/2 size-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-page)] font-serif text-xl"}
                >
                    ›
                </button>
            )}
        </div>
    );
};

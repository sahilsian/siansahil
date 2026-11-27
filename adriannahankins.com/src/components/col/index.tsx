import Image from "@/components/image";
import RichText from "@/components/richText";
import Typography from "@/components/typography";
import Button from "@/components/routerButton";
import { toButton } from "@/lib/content";
import type { ColBlock } from "@/lib/api/types.ts";

/**
 * Col: a two-column section, text and an image, both vertically centred.
 *
 * Each column is at least 357px wide and grows with the screen, so on a phone the
 * two wrap onto separate rows (text first) and on wider screens they sit side by
 * side at equal widths. `reverse` puts the image on the left. Stack several Col
 * blocks, alternating `reverse`, for a zig-zag layout.
 */
const Col = ({ block, defaultHeight = "auto" }: { block: ColBlock; defaultHeight?: "screen" | "auto" }) => {
    const height = block.height ?? defaultHeight;
    return (
        <section
            className={`Col w-full flex flex-wrap items-center gap-10 lg:gap-16 py-12
                ${block.reverse ? "flex-row-reverse" : "flex-row"}
                ${height === "screen" ? "lg:min-h-screen" : ""}`}
        >
            {/* Text: centred in its column, readable line length. */}
            <div className={"flex-1 basis-[357px] min-w-[min(357px,100%)] flex justify-center"}>
                <div className={"w-full max-w-[40rem] flex flex-col gap-4"}>
                    {block.title && <Typography level={"2"} value={block.title} />}
                    <RichText richText={block.body} />
                    {(block.primary || block.secondary) && (
                        <div className={"flex flex-wrap gap-4 mt-2"}>
                            {block.primary && <Button button={toButton(block.primary, 1)} />}
                            {block.secondary && <Button button={toButton(block.secondary, 2)} />}
                        </div>
                    )}
                </div>
            </div>
            {/* Image: fills its column, centred. */}
            <div className={"flex-1 basis-[357px] min-w-[min(357px,100%)] flex justify-center"}>
                <Image className={"w-full h-auto"} image={block.image} />
            </div>
        </section>
    );
};

export default Col;

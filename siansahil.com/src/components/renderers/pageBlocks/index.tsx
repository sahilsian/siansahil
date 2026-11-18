import { ChevronDown } from "lucide-react";
import type { Block } from "@/lib/api/types.ts";
import Image from "@/components/image";
import RichText from "@/components/richText";
import { getFontStyles } from "@/components/typography/fonts.ts";

/** Renders the content blocks of a page document (inside PageLayout). */
const PageBlocks = ({ blocks }: { blocks: Block[] }) => (
    <div className={"flex flex-col gap-10"}>
        {blocks.map((block, index) => {
            switch (block.type) {
                case "imageText": {
                    const image = (
                        <div className={"w-full max-w-[420px] lg:max-w-none lg:flex-1 lg:basis-0 lg:min-w-0"}>
                            <Image className={"w-full h-auto"} image={block.image}></Image>
                        </div>
                    );
                    return (
                        <div key={index} className={`flex flex-col gap-10 lg:items-start ${block.imagePosition === "end" ? "lg:flex-row-reverse" : "lg:flex-row"}`}>
                            {image}
                            <div className={"flex-1 lg:basis-0 lg:min-w-0 flex flex-col gap-6"}>
                                <RichText richText={block.body}></RichText>
                            </div>
                        </div>
                    );
                }
                case "faq":
                    return (
                        <div key={index} className={"max-w-[760px] border-t border-black"}>
                            {block.items.map(({ question, answer }) => (
                                // Native <details>: accessible, keyboard-friendly dropdown with no JS state.
                                <details key={question} className={"group border-b border-black"}>
                                    <summary className={"flex items-center justify-between gap-4 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>
                                        <span className={getFontStyles("4")}>{question}</span>
                                        <ChevronDown className={"shrink-0 transition-transform duration-200 group-open:rotate-180"} size={20} aria-hidden />
                                    </summary>
                                    <div className={"pb-5"}>
                                        <RichText richText={answer}></RichText>
                                    </div>
                                </details>
                            ))}
                        </div>
                    );
                case "richText":
                    return (
                        <div key={index} className={"max-w-[760px] flex flex-col gap-4"}>
                            <RichText richText={block.body}></RichText>
                        </div>
                    );
                default:
                    // Blocks with their own routes/layouts (hero, form, collection, printClub)
                    // aren't rendered inside a generic page.
                    return null;
            }
        })}
    </div>
);

export default PageBlocks;

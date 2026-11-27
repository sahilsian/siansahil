import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Image from "@/components/image";
import {SubscribeLink} from "@/layouts/printClub/subscribeLink.tsx";
import {ShopifySubscription} from "@/lib/shopify";
import type {PrintClubBlock} from "@/lib/api/types.ts";

const SECTION_SPACING = "60px"
const HEADLINE_CLASSES = "!font-bold !text-[1.9rem] lg:!text-[2.6rem]"

interface ContentProps {
    title: string;
    description: string;
    block: PrintClubBlock;
    subscription: ShopifySubscription | null;
}

export const Content = ({title, description, block, subscription}:ContentProps) => {
    const {intro, announcement, details, closing} = block
    return (
        <div className={"PrintClub relative z-30"}>
            <div className={"py-22 pb-6"}>
                <Typography level={"2"} value={title}></Typography>
                <Typography level={"p"} value={description}></Typography>
            </div>
            <Spacer height={"20px"}></Spacer>

            <div className={"flex flex-col lg:flex-row gap-10"}>
                <div className={"flex-1 flex flex-col justify-center"}>
                    <Typography level={"2"} value={intro.headline} className={HEADLINE_CLASSES}></Typography>
                    {intro.paragraphs.map((paragraph) => (
                        <div key={paragraph} className={"mb-5"}>
                            <Typography level={"p"} value={paragraph}></Typography>
                        </div>
                    ))}
                    <div>
                        <SubscribeLink subscription={subscription} label={intro.ctaLabel}></SubscribeLink>
                    </div>
                </div>
                <div className={"flex-1 lg:max-w-[480px]"}>
                    {/* 1/3 shorter than the source; weighted to crop more sky so the subject's boots stay in frame. */}
                    <Image className={"w-full h-auto aspect-[1290/1457]"} objectPosition={"50% 70%"} image={intro.image}></Image>
                </div>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"border border-[var(--color-border)] px-6 py-6 shadow-[-12px_12px_0_0_var(--color-border)]"}>
                <div className={"flex flex-col md:flex-row md:items-start justify-between gap-6 mb-4"}>
                    <div>
                        {announcement.headlineLines.map((line) => (
                            <Typography key={line} level={"2"} value={line} className={`!mb-0 ${HEADLINE_CLASSES}`}></Typography>
                        ))}
                    </div>
                    <div className={"border border-[var(--color-border)] bg-[var(--color-highlight)] px-4 py-3 self-start shrink-0"}>
                        <Typography level={"small"} value={announcement.price.prefix}></Typography>
                        <Typography level={"3"} value={announcement.price.amount} className={"!text-[1.6rem] lg:!text-[2.2rem]"}></Typography>
                        <Typography level={"small"} value={announcement.price.note}></Typography>
                    </div>
                </div>
                <SubscribeLink subscription={subscription} label={announcement.ctaLabel}></SubscribeLink>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"flex flex-col md:flex-row gap-10"}>
                <div className={"flex-1"}>
                    <Typography level={"3"} value={details.title}></Typography>
                    <Typography level={"p"} value={details.body}></Typography>
                </div>
                <div className={"flex-1"}>
                    <Typography level={"3"} value={details.benefitsTitle}></Typography>
                    <ul className={"list-disc pl-6"}>
                        {details.benefits.map((benefit) => (
                            <li key={benefit}>
                                <Typography level={"p"} value={benefit}></Typography>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"flex flex-col items-center"}>
                <Typography level={"2"} alignment={"center"} value={closing.headline} className={HEADLINE_CLASSES}></Typography>
                <SubscribeLink subscription={subscription} label={closing.ctaLabel}></SubscribeLink>
            </div>
        </div>
    )
}

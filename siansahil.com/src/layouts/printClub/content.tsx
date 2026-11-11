import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Image, {StrapiImage} from "@/components/image";
import {SubscribeLink} from "@/layouts/printClub/subscribeLink.tsx";
import {ShopifySubscription} from "@/lib/shopify";

const SECTION_SPACING = "60px"
const HEADLINE_CLASSES = "!font-bold !text-[1.9rem] lg:!text-[2.6rem]"

const ARTICLE_PARAGRAPHS = [
    "Some might think he’s crazy, and honestly he might be. Sahil Sian is a Plein Air painter from Surrey BC on a mission to paint some of Vancouvers iconic spots completely from life.",
    "In one of his earliest missions, he’s been seen completing a large 24x30 inch painting on False Creek of Science World. He’s also been seen downtown, painting in the heart of Vancouvers busiest streets. If you met him today, he probably handed you this flyer that you’re currently reading right now.",
];

const MEMBER_BENEFITS = [
    "Two 8.5 x 11 inch Prints of my Recent Paintings per Month.",
    "Raffle entries for 3 original artwork giveaways per year.",
    "Chance to suggest future painting spots",
    "Lots of extras including prints of sketches and notes from my journeys",
];

const PHOTO: StrapiImage = {
    url: "/sahil_standing_next_to_science_world.PNG",
    width: 1290,
    height: 2186,
    alternativeText: "Sahil Sian standing next to his painting of Science World, with Science World behind him",
    name: "sahil_standing_next_to_science_world.PNG",
};

interface ContentProps {
    subscription: ShopifySubscription | null;
}

export const Content = ({subscription}:ContentProps) => {
    return (
        <div className={"PrintClub relative z-30"}>
            <div className={"py-22 pb-6"}>
                <Typography level={"2"} value={"Vancouver City Print Club"}></Typography>
                <Typography level={"p"} value={"Sign up for the Vancouver city print club and recieve 2 prints of my work per month, right at your door!"}></Typography>
            </div>
            <Spacer height={"20px"}></Spacer>

            <div className={"flex flex-col lg:flex-row gap-10"}>
                <div className={"flex-1 flex flex-col justify-center"}>
                    <Typography level={"2"} value={"I Paint Vancouvers Most Iconic Spots..."} className={HEADLINE_CLASSES}></Typography>
                    {ARTICLE_PARAGRAPHS.map((paragraph) => (
                        <div key={paragraph} className={"mb-5"}>
                            <Typography level={"p"} value={paragraph}></Typography>
                        </div>
                    ))}
                    <div>
                        <SubscribeLink subscription={subscription}></SubscribeLink>
                    </div>
                </div>
                <div className={"flex-1 lg:max-w-[480px]"}>
                    {/* 1/3 shorter than the source; weighted to crop more sky so his boots stay in frame. */}
                    <Image className={"w-full h-auto aspect-[1290/1457]"} objectPosition={"50% 70%"} image={PHOTO}></Image>
                </div>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"border border-black px-6 py-6 shadow-[-12px_12px_0_0_#000]"}>
                <div className={"flex flex-col md:flex-row md:items-start justify-between gap-6 mb-4"}>
                    <div>
                        <Typography level={"2"} value={"And Now..."} className={`!mb-0 ${HEADLINE_CLASSES}`}></Typography>
                        <Typography level={"2"} value={"He’s Opening the"} className={`!mb-0 ${HEADLINE_CLASSES}`}></Typography>
                        <Typography level={"2"} value={"Vancouver City Print Club!"} className={`!mb-0 ${HEADLINE_CLASSES}`}></Typography>
                    </div>
                    <div className={"border border-black bg-[#FDE26B] px-4 py-3 self-start shrink-0"}>
                        <Typography level={"small"} value={"ONLY"}></Typography>
                        <Typography level={"3"} value={"$19 a Month!"} className={"!text-[1.6rem] lg:!text-[2.2rem]"}></Typography>
                        <Typography level={"small"} value={"Free shipping for Canadians"}></Typography>
                    </div>
                </div>
                <SubscribeLink subscription={subscription}></SubscribeLink>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"flex flex-col md:flex-row gap-10"}>
                <div className={"flex-1"}>
                    <Typography level={"3"} value={"Join the coolest new thing!"}></Typography>
                    <Typography level={"p"} value={"Every month you will recieve two high quality prints of the paintings I create of Vancouvers coolest places. Club members will also be entered into raffles for original artwork and have a chance to suggest future paintings!"}></Typography>
                </div>
                <div className={"flex-1"}>
                    <Typography level={"3"} value={"Members Recieve"}></Typography>
                    <ul className={"list-disc pl-6"}>
                        {MEMBER_BENEFITS.map((benefit) => (
                            <li key={benefit}>
                                <Typography level={"p"} value={benefit}></Typography>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <Spacer height={SECTION_SPACING}></Spacer>

            <div className={"flex flex-col items-center"}>
                <Typography level={"2"} alignment={"center"} value={"What are ya waiting for? Join the club!"} className={HEADLINE_CLASSES}></Typography>
                <SubscribeLink subscription={subscription} label={"Join the Club Today"}></SubscribeLink>
            </div>
        </div>
    )
}

import Typography from "@/components/typography";
import Button, {ButtonData} from "@/components/routerButton";
import Image, {StrapiImage} from "@/components/image";
import {useAppState} from "@/hooks/useAppState.ts";
import Spinner from "@/components/spinner";

interface ContentProps {
    title: string;
    description: string;
    /** Round avatar beside the name; none = no avatar. */
    profile?: StrapiImage;
    primary: ButtonData,
    secondary?: ButtonData,
    /** "cutout": text floats over a cut-out photo; "photo": text sits beside a full photo. */
    style: "cutout" | "photo";
}
export const Content = ({title="Test", description="Test", profile, primary, secondary, style}:ContentProps) => {
    const ctx = useAppState()
    const photo = style === "photo"

    return (
        <div className={photo
            // In normal flow: above the photo on small screens, left of it on lg+. Top padding clears the fixed header.
            ? "flex lg:items-start w-full lg:flex-1 lg:min-w-0 pt-32 pb-8 px-4 lg:pl-22 lg:pr-4 lg:pt-36 lg:pb-12"
            // Over the cut-out photo, which is anchored to the bottom right.
            : "absolute lg:max-w-[900px] flex lg:items-center w-full py-32 px-4 lg:px-22 lg:mt-10"}>
            <div className={"w-full  z-20 max-w-[840px] px-4 lg:p-4"}>
                {photo ? (
                    // Avatar stacked above the name, left-aligned with the text below.
                    <div className={"flex flex-col items-start gap-2 lg:gap-4"}>
                        {/* Circular frame; the image is centred so non-square portraits keep the face in frame. */}
                        {profile && <div className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px] shrink-0 rounded-full overflow-hidden border-2 border-[var(--color-border)]"}>
                            <Image className={"w-full h-full rounded-full"} objectFit={"cover"} objectPosition={"50% 40%"} image={profile} />
                        </div>}
                        <Title title={title} processing={ctx.isProcessing} />
                    </div>
                ) : (
                    // Avatar beside the name.
                    <div className={"flex items-center gap-4"}>
                        {profile && <div className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px] rounded-full overflow-hidden mb-2 lg:mb-4 border-2 border-[var(--color-border)]"}>
                            <Image className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px]"} image={profile} />
                        </div>}
                        <Title title={title} processing={ctx.isProcessing} />
                    </div>
                )}
                <Typography value={description} level={"p"}></Typography>
                <div className={"ControlGroup flex gap-4 mt-4"}>
                    <Button button={primary} ></Button>
                    {secondary && <Button button={secondary}></Button>}
                </div>

            </div>
        </div>
    )
}

const Title = ({title, processing}: { title: string; processing: boolean }) => (
    <div className={'flex'}>
        <Typography value={title} level={"1"}></Typography>
        <div className={''}>
            {processing && <Spinner></Spinner>}
        </div>
    </div>
)

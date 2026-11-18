import Typography from "@/components/typography";
import Button, {ButtonData} from "@/components/routerButton";
import Image, {StrapiImage} from "@/components/image";
import {useAppState} from "@/hooks/useAppState.ts";
import Spinner from "@/components/spinner";

interface ContentProps {
    title: string;
    description: string;
    profile: StrapiImage;
    primary: ButtonData,
    secondary?: ButtonData,
}
export const Content = ({title="Test", description="Test", profile, primary, secondary}:ContentProps) => {
    const ctx = useAppState()

    return (
        // In normal flow: above the photo on small screens, left of it on lg+.
        // Top padding clears the fixed header.
        <div className={"flex lg:items-start w-full lg:flex-1 lg:min-w-0 pt-32 pb-8 px-4 lg:pl-22 lg:pr-4 lg:pt-36 lg:pb-12"}>
            <div className={"w-full  z-20 max-w-[840px] px-4 lg:p-4"}>
                {/* Avatar stacked above the name (column), left-aligned with the text below. */}
                <div className={"flex flex-col items-start gap-2 lg:gap-4"}>
                    {/* Circular avatar: the frame clips to a circle, and the image is centred
                        (not top-anchored) so non-square portraits keep the face in frame. */}
                    <div className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px] shrink-0 rounded-full overflow-hidden border-2 border-[var(--color-border)]"}>
                        <Image className={"w-full h-full rounded-full"} objectFit={"cover"} objectPosition={"50% 40%"} image={profile} />
                    </div>
                    <div className={'flex'}>
                    <Typography value={title} level={"1"}></Typography>
                        <div className={''}>
                            {ctx.isProcessing && <Spinner></Spinner>}
                        </div>
                    </div>
                </div>
                <Typography value={description} level={"p"}></Typography>
                <div className={"ControlGroup flex gap-4 mt-4"}>
                    <Button button={primary} ></Button>
                    {secondary && <Button button={secondary}></Button>}
                </div>

            </div>
        </div>
    )
}


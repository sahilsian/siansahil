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
        <div className={"absolute lg:max-w-[900px] flex lg:items-center w-full py-32 px-4 lg:px-22 lg:mt-10"}>
            <div className={"w-full  z-20 max-w-[840px] px-4 lg:p-4"}>
                <div className={"flex items-center gap-4"}>
                    <div className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px] rounded-full overflow-hidden mb-2 lg:mb-4 border-2 border-black"}>
                        <Image className={"w-[60px] h-[60px] lg:w-[120px] lg:h-[120px]"} image={profile} />
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


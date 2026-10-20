import Typography from "@/components/typography";
import Button, {ButtonData} from "@/components/routerButton";

interface ContentProps {
    title: string
    description: string
    primary: ButtonData
    secondary?: ButtonData
}
export const Content = ({title, description, primary, secondary}:ContentProps) => {
    return (
        <div className={"flex md:flex-1  min-w-[350px] justify-center items-center"}>
            <div className={"w-full lg:px-22 m-auto p-6 "}>
                <div className={"pb-[10px]"}>
                    <Typography value={title} level={"2"}>
                    </Typography>
                    <Typography value={description} level={"p"}>
                    </Typography>
                </div>

                <div className={"ControlGroup flex gap-4 mt-2 lg:mt-7"}>
                    <Button button={primary}></Button>
                    {secondary && <Button button={secondary}></Button>}
                </div>
            </div>
        </div>
    )
}
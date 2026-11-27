import Typography from "@/components/typography";
import Button, {ButtonData} from "@/components/routerButton";

interface ContentProps {
    title: string
    description: string
    primary: ButtonData
}
export const Content = ({title, description, primary}:ContentProps) => {
    return (
        <div className={"flex flex-1 justify-center items-center"}>
            <div className={"w-full lg:px-22 m-auto p-4 "}>
                <div className={"pb-[10px]"}>
                    <Typography alignment={"center"} value={title} level={"2"}>
                    </Typography>
                    <Typography alignment={"center"} value={description} level={"p"}>
                    </Typography>
                </div>
                <div className={"ControlGroup flex justify-center gap-4 mt-7"}>
                    <Button button={primary}></Button>
                </div>
            </div>
        </div>
    )
}
import Screen from "@/components/screen";
import Typography from "@/components/typography";
import {useSite} from "@/contexts/site/siteContext.tsx";

const FourOFour = () => {
    const { messages } = useSite()
    return (
        <Screen classOverride={"h-screen"}>
            <div className={"w-full flex justify-center items-center"}>
                <Typography level={'2'} value={messages.notFound}></Typography>
            </div>
        </Screen>
    )
}

export default FourOFour

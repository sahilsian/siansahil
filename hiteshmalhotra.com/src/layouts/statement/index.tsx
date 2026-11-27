import {Content} from "@/layouts/statement/content.tsx";
import {ButtonData} from "@/components/routerButton";
import Screen from "@/components/screen";
interface FeatureLayoutProps {
    title: string;
    description: string;
    primary: ButtonData
}

const StatementLayout = ({title, description, primary}:FeatureLayoutProps) => {
    return (
        <Screen classOverride={"py-20"}>
            <div className={`relative h-full flex-1 flex`}>
                <div className={`flex z-20 w-full h-full`}>
                    <Content primary={primary} title={title} description={description} />
                </div>
            </div>
        </Screen>

    )
}

export default StatementLayout
import Screen from "@/components/screen";
import {Content} from "@/layouts/hero/content.tsx"
import {StrapiImage} from "@/components/image";
import {Media} from "@/layouts/hero/media.tsx";
import {ButtonData} from "@/components/routerButton";

type Variations = 'flex-row' | 'flex-row-reverse'

interface HeroLayoutProps {
    variation: Variations,
    image: StrapiImage,
    profile: StrapiImage,
    title: string,
    description: string
    primary: ButtonData
    secondary?: ButtonData
}
const HeroLayout = ({variation, image, title, description, profile, primary, secondary}:HeroLayoutProps) => {
    return (
        <Screen classOverride={"min-h-screen overflow-hidden"}>
            <div className={"flex w-full h-full flex-1 "}>
                <div className={`Hero h-full flex flex-1 ${variation}`}>
                    {/*absolute stack*/}
                    {/*desktop-screens*/}
                    <Media image={image} />
                    {/*mobile screens*/}
                    <Media mobile image={image} />
                    <Content
                        profile={profile}
                        title={title}
                        description={description}
                        primary={primary}
                        secondary={secondary}
                    />
                </div>
            </div>
        </Screen>
    )
}

export default HeroLayout
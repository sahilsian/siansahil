import Screen from "@/components/screen";
import {Content} from "@/layouts/hero/content.tsx"
import Image, {StrapiImage} from "@/components/image";
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

// Hero in normal flow (no absolute positioning), which suits a full rectangular
// photo; the original bottom-anchored layout was for a transparent cut-out.
//   Mobile/tablet: intro (avatar, name, description, buttons), then the photo below.
//   Laptop+ (lg):  intro on the left, photo on the right, both aligned to the top.
const HeroLayout = ({image, title, description, profile, primary, secondary}:HeroLayoutProps) => {
    return (
        <Screen classOverride={"min-h-screen"}>
            <div className={"Hero w-full flex flex-col lg:flex-row lg:items-start lg:min-h-screen"}>
                <Content
                    profile={profile}
                    title={title}
                    description={description}
                    primary={primary}
                    secondary={secondary}
                />
                <div className={"w-full px-4 pb-12 lg:flex-1 lg:min-w-0 lg:h-screen lg:p-0 lg:flex lg:justify-end"}>
                    <Image className={"w-full h-auto lg:w-auto lg:max-w-full lg:h-full"} objectFit={"contain"} image={image} />
                </div>
            </div>
        </Screen>
    )
}

export default HeroLayout

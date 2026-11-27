import Screen from "@/components/screen";
import {Content} from "@/layouts/hero/content.tsx"
import Image, {StrapiImage} from "@/components/image";
import {Media} from "@/layouts/hero/media.tsx";
import {ButtonData} from "@/components/routerButton";
import {useSite} from "@/contexts/site/siteContext.tsx";

type Variations = 'flex-row' | 'flex-row-reverse'

interface HeroLayoutProps {
    variation: Variations,
    image?: StrapiImage,
    /** Muted looping video shown instead of the photo (photo style only), centre-cropped to a 3:4 frame. */
    video?: { url: string; type?: string },
    profile?: StrapiImage,
    title: string,
    description: string
    primary: ButtonData
    secondary?: ButtonData
}

// Two looks, picked per site with site.theme.hero:
//   "photo" (default): a full rectangular photo in normal flow. Mobile/tablet: intro,
//                      then the photo below; laptop+ (lg): intro left, photo right.
//   "cutout":          a transparent cut-out photo anchored to the bottom right, with
//                      the intro text floating over it (siansahil).
const HeroLayout = ({variation, image, video, title, description, profile, primary, secondary}:HeroLayoutProps) => {
    const style = useSite().theme.hero === "cutout" ? "cutout" : "photo"
    const content = (
        <Content
            profile={profile}
            title={title}
            description={description}
            primary={primary}
            secondary={secondary}
            style={style}
        />
    )

    if (style === "photo") {
        return (
            <Screen classOverride={"min-h-screen"}>
                <div className={"Hero w-full flex flex-col lg:flex-row lg:items-start lg:min-h-screen"}>
                    {content}
                    <div className={"w-full px-4 pb-12 lg:flex-1 lg:min-w-0 lg:h-screen lg:p-0 lg:flex lg:justify-end"}>
                        {video ? (
                            // Centre crop: the frame is the hero photo's 3:4 portrait shape and
                            // object-cover trims the video's sides to fill it.
                            <video
                                className={"w-full aspect-[3/4] object-cover object-center lg:w-auto lg:max-w-full lg:h-full"}
                                autoPlay
                                muted
                                loop
                                playsInline
                                preload={"auto"}
                                poster={image?.url}
                                aria-hidden
                            >
                                <source src={video.url} type={video.type ?? "video/mp4"} />
                            </video>
                        ) : image && (
                            <Image className={"w-full h-auto lg:w-auto lg:max-w-full lg:h-full"} objectFit={"contain"} image={image} />
                        )}
                    </div>
                </div>
            </Screen>
        )
    }

    return (
        <Screen classOverride={"min-h-screen overflow-hidden"}>
            <div className={"flex w-full h-full flex-1 "}>
                <div className={`Hero h-full flex flex-1 ${variation}`}>
                    {/*absolute stack*/}
                    {/*desktop-screens*/}
                    {image && <Media image={image} />}
                    {/*mobile screens*/}
                    {image && <Media mobile image={image} />}
                    {content}
                </div>
            </div>
        </Screen>
    )
}

export default HeroLayout

import Image, {StrapiImage} from "../../components/image"
interface BackgroundProps {
    image: StrapiImage;
    mobile?: boolean
}

export const Media = ({image, mobile}: BackgroundProps) => {
    return mobile
        ?   <div className="HERO_IMG flex xl:hidden absolute bottom-0 w-full h-screen z-10 flex-1">
                <div className="flex w-full h-full justify-end items-end">
                    <Image className={"h-[60%] w-auto ml-auto"} objectFit={"contain"} image={image} />
                </div>
            </div>
        :   <div className="HERO_IMG hidden xl:flex absolute w-full h-screen z-10 flex-1">
                <div className="flex w-full h-full justify-end items-end">
                    <Image className={"h-full w-auto ml-auto"} objectFit={"contain"} image={image} />
                </div>
            </div>

};

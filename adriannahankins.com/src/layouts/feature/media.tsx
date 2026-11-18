import Image, {StrapiImage} from "@/components/image";

interface MediaProps {
    image: StrapiImage
}
export const Media = ({image}:MediaProps) => {
    return (
        <div className={"w-full flex items-center justify-center lg:flex-1"}>
            <div className={" p-6 md:p-8 xl:p-15 "}>
                <Image className={"min-w-[300px] "} image={image} />
            </div>
        </div>
    )
}
import Image, {StrapiImage} from '@/components/image'

interface FormImageProps {
    image: StrapiImage
}
export const FormImage = ({image}:FormImageProps) => {
    return (
        <div className={'flex-1 w-full lg:flex hidden'}>
            <Image image={image}></Image>
        </div>
    )
}
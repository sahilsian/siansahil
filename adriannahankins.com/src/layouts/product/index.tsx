import {StrapiImage} from "@/components/image";
import {Tab} from "@/components/tabbedContent";
import Background from "@/layouts/product/background.tsx";
import {Content} from "@/layouts/product/content.tsx";
import type {ArtworkStore, Availability, PrintLink} from "@/lib/api/types.ts";

interface ProductLayoutProps {
    type?: string;
    title: string;
    slug?: string;
    image: StrapiImage;
    images?: StrapiImage[];
    description: string;
    backgroundColor?: string;
    tabs?: Tab[];
    dateCreated?: string;
    material?: string;
    store?: ArtworkStore;
    prints?: PrintLink[];
    availability?: Availability;
}

const ProductLayout = ({ title, slug, description, image, images, tabs, dateCreated, material, backgroundColor="transparent", store, prints, availability}:ProductLayoutProps) => {
    return (
        <div style={{backgroundColor: backgroundColor}} className={'p-6 md:px-22 py-22 relative'}>
            <Background></Background>
            <Content slug={slug} dateCreated={dateCreated} material={material} title={title} description={description} image={image} images={images} tabs={tabs} store={store} prints={prints} availability={availability}></Content>
        </div>

    )
}

export default ProductLayout
import {List} from "@/layouts/collection/list.tsx";
import {Content} from "@/layouts/collection/content.tsx";
import {Background} from "@/layouts/collection/background.tsx";
import {PageInfoProps} from "@/components/pagination";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";
import {useAppState} from "@/hooks/useAppState.ts";

interface CollectionProps {
    collection: any[];
    type: string;
    pageInfo: PageInfoProps;
    categories: CollectionCategory[]
    currentCollection: string
}


const CollectionLayout = ({collection, pageInfo, type, categories, currentCollection}:CollectionProps) => {
    const controlMachine = useAppState()
    const currentCategory = currentCollection

    const { layoutTitle, layoutDescription } = categories.find((category) =>
        category.category.name === currentCategory
    ) || {}

    return (
        <div className={`Collection ${type} lg:px-22 px-6 relative min-h-screen`}>
            <Background></Background>
            <Content categoryKey={currentCategory} controlMachine={controlMachine} title={layoutTitle} description={layoutDescription}></Content>
            <List categories={categories} currentCollection={currentCollection} controlMachine={controlMachine} pageInfo={pageInfo} collection={collection}></List>
        </div>
    )
}

export default CollectionLayout
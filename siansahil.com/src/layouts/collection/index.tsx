import {List} from "@/layouts/collection/list.tsx";
import {Content} from "@/layouts/collection/content.tsx";
import {Background} from "@/layouts/collection/background.tsx";
import {PageInfoProps} from "@/components/pagination";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";
import {useSearch} from "@tanstack/react-router";
import {useAppState} from "@/hooks/useAppState.ts";

interface CollectionProps {
    collection: any[];
    type: string;
    pageInfo: PageInfoProps;
    categories: CollectionCategory[]
}


const CollectionLayout = ({collection, pageInfo, type, categories}:CollectionProps) => {
    const controlMachine = useAppState()
    const search = useSearch({ strict: false })

    const currentCategory = search.category || 'all'

    const { layoutTitle, layoutDescription } = categories.find((category) =>
        category.category.name === currentCategory
    ) || {}

    return (
        <div className={`Collection ${type} lg:px-22 px-6 bg-[#EDEDED] relative min-h-screen`}>
            <Background></Background>
            <Content categoryKey={currentCategory} controlMachine={controlMachine} title={layoutTitle} description={layoutDescription}></Content>
            <List categories={categories} controlMachine={controlMachine} pageInfo={pageInfo} collection={collection}></List>
        </div>
    )
}

export default CollectionLayout
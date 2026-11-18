import Post from "@/components/post";
import {withRouter} from "@/decorators/withRouter";
import {Control} from "@/layouts/collection/control.tsx";
import {PageInfoProps} from "@/components/pagination";
import {ControlInterface} from "@/hooks/useControl.ts";
import NoResults from "@/components/noResults";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";

interface ListProps {
    collection: any[],
    pageInfo: PageInfoProps,
    controlMachine: ControlInterface
    categories: CollectionCategory[]
    currentCollection: string
}

const PostWithRouter = withRouter(Post);

export const List = ({controlMachine, collection, categories, currentCollection}: ListProps) => {

    const returnPostCollection = (columns: 3 | 4) => {
        return <div className={"flex flex-wrap relative z-index-[20] gap-6"}>
            {collection.map((item) => (
                    <PostWithRouter
                        disabled={controlMachine.state.mode === "LOADING"}
                        key={item.slug}
                        slug={item.slug}
                        title={item.title}
                        clickable={true}
                        image={item.image}
                        columns={columns}
                        shop={item.shop}
                    />
                ))}
        </div>;
    }

    const renderType = () => {
        switch (controlMachine.state.view) {
            case "post":
                return returnPostCollection(3)

            case "list":
                return returnPostCollection(4)

            default:
                return returnPostCollection(3)
        }
    }

    return (
        <Control categories={categories} currentCollection={currentCollection} controlMachine={controlMachine}>
            <div key={controlMachine.state.view}>
                {collection.length === 0 && (
                    <div className={"min-h-[420px]"}>
                        <NoResults />
                    </div>
                )}
                {renderType()}
            </div>
        </Control>
    )
}
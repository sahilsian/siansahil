import Post from "@/components/post";
import {withRouter} from "@/decorators/withRouter";
import {Control} from "@/layouts/collection/control.tsx";
import {PageInfoProps} from "@/components/pagination";
import {ControlInterface} from "@/hooks/useControl.ts";
import NoResults from "@/components/noResults";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";
import ListPost from "@/components/listPost";

interface ListProps {
    collection: any[],
    pageInfo: PageInfoProps,
    controlMachine: ControlInterface
    categories: CollectionCategory[]
}

const PostWithRouter = withRouter(Post);
const ListPostWithRouter = withRouter(ListPost);

export const List = ({controlMachine, collection, pageInfo, categories}: ListProps) => {

    const returnPostCollection = () => {
        return <div className={"flex relative z-index-[20] flex-wrap gap-4"}>
            {collection.map((item) => (
                    <PostWithRouter
                        disabled={controlMachine.state.mode === "LOADING"}
                        key={item.slug}
                        slug={item.slug}
                        title={item.title}
                        clickable={true}
                        description={item.description}
                        image={item.image}
                        category={item.category.name}
                        dateCreated={item.dateCreated}
                        material={item.material}
                    />
                ))}
        </div>;
    }

    const returnListPostCollection = () => {
        return <div className={" relative z-index-[20] gap-4"}>
            {collection.map((item) => (
                <ListPostWithRouter
                    disabled={controlMachine.state.mode === "LOADING"}
                    key={item.slug}
                    slug={item.slug}
                    title={item.title}
                    clickable={true}
                    description={item.description}
                    image={item.image}
                    category={item.category.name}
                />
            ))}
        </div>;
    }
    const renderType = () => {
        switch (controlMachine.state.view) {
            case "post":
                return returnPostCollection()

            case "list":
                return returnListPostCollection()

            default:
                return returnPostCollection()
        }
    }

    return (
        <Control categories={categories} controlMachine={controlMachine} pageCount={pageInfo.pageCount} total={pageInfo.total}>
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
import {Background} from "@/layouts/form/background.tsx";
import {Content} from "@/layouts/printClub/content.tsx";
import {ShopifySubscription} from "@/lib/shopify";
import type {PrintClubBlock} from "@/lib/api/types.ts";

interface PrintClubLayoutProps {
    title: string;
    description: string;
    block: PrintClubBlock;
    subscription: ShopifySubscription | null;
}

const PrintClubLayout = ({title, description, block, subscription}:PrintClubLayoutProps) => {
    return (
        <div className={"lg:px-22 px-6 pb-22 bg-[#EDEDED] relative overflow-hidden"}>
            <Background></Background>
            <Content title={title} description={description} block={block} subscription={subscription}></Content>
        </div>
    )
}

export default PrintClubLayout

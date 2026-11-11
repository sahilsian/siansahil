import {Background} from "@/layouts/form/background.tsx";
import {Content} from "@/layouts/printClub/content.tsx";
import {ShopifySubscription} from "@/lib/shopify";

interface PrintClubLayoutProps {
    subscription: ShopifySubscription | null;
}

const PrintClubLayout = ({subscription}:PrintClubLayoutProps) => {
    return (
        <div className={"lg:px-22 px-6 pb-22 bg-[#EDEDED] relative overflow-hidden"}>
            <Background></Background>
            <Content subscription={subscription}></Content>
        </div>
    )
}

export default PrintClubLayout

import {useState} from "react";
import Button from "@/components/routerButton";
import {createShopifyCheckout, ShopifySubscription} from "@/lib/shopify";

interface SubscribeLinkProps {
    subscription: ShopifySubscription | null;
    label?: string;
}

export const SubscribeLink = ({subscription, label = "Sign up!"}:SubscribeLinkProps) => {
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    const handleCheckout = async () => {
        if (!subscription) return;
        setIsCheckingOut(true);
        try {
            const checkoutUrl = await createShopifyCheckout({ data: subscription });
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                setIsCheckingOut(false);
            }
        } catch (error) {
            console.error("Checkout failed", error);
            setIsCheckingOut(false);
        }
    };

    return (
        <Button
            button={{ id: 0, variant: "primary", label, target: "internal", route: null }}
            onClick={handleCheckout}
            disabled={!subscription || isCheckingOut}
        ></Button>
    )
}

import {formatShopifyPrice, ShopifyProductData} from "@/lib/shopify";

export interface ListingAvailability {
    originalStatus: "available" | "sold" | null;
    printsFromLabel: string | null;
    unavailable: boolean;
}

export function getListingAvailability(shop?: ShopifyProductData | null): ListingAvailability {
    const original = shop?.original;
    const availablePrints = shop?.prints?.filter((print) => print.availableForSale) ?? [];

    const originalStatus = original ? (original.availableForSale ? "available" : "sold") : null;

    const cheapestPrint = availablePrints.reduce<typeof availablePrints[number] | null>((cheapest, print) => {
        if (!cheapest) return print;
        return parseFloat(print.price) < parseFloat(cheapest.price) ? print : cheapest;
    }, null);

    const printsFromLabel = cheapestPrint
        ? formatShopifyPrice(cheapestPrint.price, cheapestPrint.currencyCode)
        : null;

    const unavailable = originalStatus !== "available" && availablePrints.length === 0;

    return {originalStatus, printsFromLabel, unavailable};
}

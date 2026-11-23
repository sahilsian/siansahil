import type {Availability} from "@/lib/api/types.ts";
import {ForSale, formatPrice} from "@/lib/store";

export interface ListingAvailability {
    originalStatus: "available" | "sold" | null;
    printsFromLabel: string | null;
    unavailable: boolean;
}

/** What a gallery list row shows: original available/sold, and "Prints from" the cheapest print. */
export function getListingAvailability(sale: ForSale, availability?: Availability, locale?: string): ListingAvailability {
    const originalStatus = sale.originalAvailable
        ? "available"
        : availability?.status === "sold" ? "sold" : availability?.status === "available" ? "available" : null;
    const cheapest = sale.prints[0];
    const printsFromLabel = cheapest ? formatPrice(cheapest.priceCents, sale.currency, locale) : null;
    const unavailable = originalStatus !== "available" && sale.prints.length === 0;
    return {originalStatus, printsFromLabel, unavailable};
}

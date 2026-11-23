// What an artwork has for sale, from the `store` the dashboard writes when an
// artwork is added to the store: prints (Stripe products) and whether the
// original is available (by inquiry, no price).
import type { ArtworkStore, Availability, SiteLabels } from "@/lib/api/types.ts";
// (Prints are their own listings now; `store.prints` on an artwork is from the old model and ignored.)

export interface ForSale {
    /** Visitors can inquire about the original painting. */
    originalAvailable: boolean;
    /** Print sizes for sale, cheapest first. */
    prints: { sizeId: string; label: string; priceCents: number }[];
    currency: string;
}

export function forSale(store: ArtworkStore | undefined, fallbackCurrency: string): ForSale {
    const prints = (store?.prints ?? [])
        .filter((p) => p.active)
        .map(({ sizeId, label, priceCents }) => ({ sizeId, label, priceCents }))
        .sort((a, b) => a.priceCents - b.priceCents);
    return {
        originalAvailable: Boolean(store?.originalAvailable),
        prints,
        currency: (store?.currency || fallbackCurrency || "CAD").toUpperCase(),
    };
}

export function formatPrice(cents: number, currency: string, locale?: string): string {
    try {
        return new Intl.NumberFormat(locale || undefined, {
            style: "currency",
            currency,
            minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        }).format(cents / 100);
    } catch {
        return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
    }
}

/** Gallery card text: the artwork's price when it is available with one, otherwise "Unavailable". */
export function cardPriceLabel(availability: Availability | undefined, labels: Pick<SiteLabels, "unavailable">): string {
    const price = availability?.status === "available" ? availability.price?.trim() : undefined;
    return price || labels.unavailable;
}

// What an artwork has for sale, from the `store` the dashboard writes when an
// artwork is added to the store: prints (Stripe products) and whether the
// original is available (by inquiry, no price).
import type { ArtworkStore, Availability, SiteLabels } from "@/lib/api/types.ts";

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

/** Card text for an artwork: original available, else "Prints from", else its availability. */
export function cardPriceLabel(
    sale: ForSale,
    availability: Availability | undefined,
    labels: Pick<SiteLabels, "available" | "sold" | "unavailable" | "printsFrom">,
    locale?: string,
): string {
    if (sale.originalAvailable) return labels.available;
    if (sale.prints.length > 0) return `${labels.printsFrom} ${formatPrice(sale.prints[0].priceCents, sale.currency, locale)}`;
    switch (availability?.status) {
        case "available": return availability.price ?? labels.available;
        case "sold": return labels.sold;
        case "unavailable": return availability.label ?? labels.unavailable;
        default: return labels.unavailable;
    }
}

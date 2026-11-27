// What an artwork has for sale. Prints are their own listings (see /prints and
// ProductDoc.prints); on the artwork itself the dashboard only records whether
// the original is available (by inquiry, no price). Works sold off-platform
// carry an `availability` instead (status, optional display price).
import type { Availability, ArtworkStore, SiteLabels } from "@/lib/api/types.ts";

export interface ForSale {
    /** Visitors can inquire about the original painting. */
    originalAvailable: boolean;
    currency: string;
}

export function forSale(store: ArtworkStore | undefined, fallbackCurrency: string): ForSale {
    return {
        originalAvailable: Boolean(store?.originalAvailable),
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

/**
 * Gallery card text under the title (only when the site's theme.galleryStatus is on):
 * the price or "Available", "Sold", or the unavailable note (e.g. "Personal Collection").
 * Null (nothing shown) for items with no status at all, such as events.
 */
export function cardStatusLabel(
    sale: ForSale,
    availability: Availability | undefined,
    labels: Pick<SiteLabels, "available" | "sold" | "unavailable">,
): string | null {
    if (sale.originalAvailable) return labels.available;
    switch (availability?.status) {
        case "available": return availability.price?.trim() || labels.available;
        case "sold": return labels.sold;
        case "unavailable": return availability.label ?? labels.unavailable;
        default: return null;
    }
}

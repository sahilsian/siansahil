import { createContext, useContext, type PropsWithChildren } from "react";
import type { SiteDoc } from "@/lib/api/types.ts";

// The tenant's site document (labels, messages, social links, mailing copy...),
// loaded once by the root route and available to every component.
const SiteContext = createContext<SiteDoc | null>(null);

export const SiteProvider = ({ site, children }: PropsWithChildren<{ site: SiteDoc }>) => (
    <SiteContext value={site}>{children}</SiteContext>
);

export function useSite(): SiteDoc {
    const site = useContext(SiteContext);
    if (!site) throw new Error("useSite() must be used inside <SiteProvider>");
    return site;
}

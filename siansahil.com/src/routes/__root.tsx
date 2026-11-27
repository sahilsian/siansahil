import {
    HeadContent,
    createRootRouteWithContext,
    Scripts,
} from '@tanstack/react-router'

import appCss from '../styles.css?url'
import type { QueryClient } from "@tanstack/react-query"
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { TRPCRouter } from "@/integrations/trpc/router.ts"
import { getFormDoc, getPage, getSite, toFooterMenu, toForm, toHeaderMenu, toRootSeo, toStyles } from "@/lib/content"
import Menu from "@/components/menu"
import Footer from "@/components/footer"
import Providers from "@/decorators/providers"
import RouterSync from "@/components/routerSync"
import { SiteProvider } from "@/contexts/site/siteContext.tsx"
import { themeCss, themeFontStylesheet } from "@/lib/theme.ts"
import type { SiteDoc } from "@/lib/api/types.ts"
import type { FormProps } from "@/hooks/useFormControl.ts"

interface LoaderData {
    site: SiteDoc | null
    mailingForm: FormProps | null
    /** The home page hero's description: the footer's text under the name when the footer sets none. */
    heroDescription: string
}

interface MyRouterContext {
    queryClient: QueryClient
    trpc: TRPCOptionsProxy<TRPCRouter>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    // beforeLoad (not loader): it finishes before any child loader starts, so the
    // site is available even when a child throws notFound() and the 404 page
    // renders through this shell. Cached by react-query, so cheap per navigation.
    beforeLoad: async ({ context }): Promise<LoaderData> => {
        // If the content server is unreachable, render the bare fallback
        // page below instead of crashing.
        try {
            const site = await context.queryClient.ensureQueryData({
                queryKey: ['site'],
                queryFn: getSite,
            })
            // The mailing list is optional per tenant (site.mailing null = no signup form).
            const mailing = site.mailing
            const mailingForm = mailing
                ? toForm(await context.queryClient.ensureQueryData({
                    queryKey: ['form', mailing.formId],
                    queryFn: () => getFormDoc(mailing.formId),
                }))
                : null
            // Same query as the home page, so it's fetched once and shared.
            const home = await context.queryClient
                .ensureQueryData({ queryKey: ['page', 'home'], queryFn: () => getPage('home') })
                .catch(() => null)
            const hero = home?.blocks.find((block) => block.type === "hero")
            const heroDescription = hero && hero.type === "hero" ? hero.description : ""
            return { site, mailingForm, heroDescription }
        } catch (error) {
            console.error("Failed to load site content", error)
            return { site: null, mailingForm: null, heroDescription: "" }
        }
    },

    head: ({ match }) => {
        const site = match.context.site
        if (!site) {
            return { meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }] }
        }
        const rootSEO = toRootSeo(site)

        return {
            meta: [
                { charSet: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { title: rootSEO.siteTitle },
                { name: "description", content: rootSEO.siteDescription },
                { name: "robots", content: rootSEO.robots },
                { property: 'og:site_name', content: rootSEO.siteName },
                { property: 'og:title', content: rootSEO.siteTitle },
                { property: 'og:description', content: rootSEO.siteDescription },
                { property: 'og:image', content: rootSEO.siteOGImage.url },
                { property: 'og:type', content: "website" },
            ],
            links: [
                { rel: 'stylesheet', href: appCss },
                ...(themeFontStylesheet(site) ? [
                    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' as const },
                    { rel: 'stylesheet', href: themeFontStylesheet(site)! },
                ] : []),
                { rel: 'icon', type: "image/png", href: site.favicons.png96, sizes: "96x96" },
                { rel: 'icon', type: "image/svg+xml", href: site.favicons.svg },
                { rel: 'shortcut icon', href: site.favicons.ico },
                { rel: 'apple-touch-icon', sizes: "180x180", href: site.favicons.appleTouch },
                { rel: 'manifest', href: site.favicons.manifest },
                { rel: 'canonical', href: rootSEO.canonicalDomain },
            ],
        }
    },
    shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
    const { site, mailingForm, heroDescription } = Route.useRouteContext()

    if (!site) {
        // Tenant-agnostic on purpose: with no content server there is no tenant copy to show.
        return (
            <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body style={{ fontFamily: "serif", padding: "2rem" }}>
            <p>This site couldn't load right now. Please try again in a moment.</p>
            <Scripts />
            </body>
            </html>
        )
    }

    const styles = toStyles(site)
    const menu = toHeaderMenu(site)
    const footer = toFooterMenu(site)

    return (
        <html lang={site.locale}>
        <head>
            <HeadContent />
            {/* Tenant theme: colours and fonts as CSS variables (src/lib/theme.ts). */}
            <style>{themeCss(site)}</style>
        </head>

        <SiteProvider site={site}>
        <Providers styles={styles}>
            <RouterSync />
            <Menu backgroundColor={"var(--color-menu)"} title={menu.title} menuItems={menu.mainMenuItems}></Menu>
            {children}
            <Footer title={footer.title} description={footer.description?.trim() || heroDescription} menuItems={footer.footerMenuItems} mailingForm={mailingForm}></Footer>
        </Providers>
        </SiteProvider>

        <Scripts />
        </html>
    )
}

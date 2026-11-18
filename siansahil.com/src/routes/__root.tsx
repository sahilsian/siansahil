import {
    HeadContent,
    createRootRouteWithContext,
    Scripts,
} from '@tanstack/react-router'

import appCss from '../styles.css?url'
import type { QueryClient } from "@tanstack/react-query"
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { TRPCRouter } from "@/integrations/trpc/router.ts"
import { getFormDoc, getSite, toFooterMenu, toForm, toHeaderMenu, toRootSeo, toStyles } from "@/lib/content"
import Menu from "@/components/menu"
import Footer from "@/components/footer"
import Providers from "@/decorators/providers"
import RouterSync from "@/components/routerSync"
import { SiteProvider } from "@/contexts/site/siteContext.tsx"
import type { SiteDoc } from "@/lib/api/types.ts"
import type { FormProps } from "@/hooks/useFormControl.ts"

interface LoaderData {
    site: SiteDoc | null
    mailingForm: FormProps | null
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
            const mailingForm = await context.queryClient.ensureQueryData({
                queryKey: ['form', site.mailing.formId],
                queryFn: () => getFormDoc(site.mailing.formId),
            })
            return { site, mailingForm: toForm(mailingForm) }
        } catch (error) {
            console.error("Failed to load site content", error)
            return { site: null, mailingForm: null }
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
    const { site, mailingForm } = Route.useRouteContext()

    if (!site || !mailingForm) {
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
            <style>{`
          body {
            background-color: ${styles.backgroundHex};
          }

          .text_button {
            color: ${styles.textButtonHex};
          }

          .text_highlighted {
            color: ${styles.secondaryHex};
          }

          .text_secondary {
            color: ${styles.textSecondaryHex};
          }

          .icon_active {
            background-color: ${styles.iconActiveHex};
          }
        `}</style>
        </head>

        <SiteProvider site={site}>
        <Providers styles={styles}>
            <RouterSync />
            <Menu backgroundColor={styles.menuHex} title={menu.title} menuItems={menu.mainMenuItems}></Menu>
            {children}
            <Footer title={footer.title} description={footer.description} menuItems={footer.footerMenuItems} mailingForm={mailingForm}></Footer>
        </Providers>
        </SiteProvider>

        <Scripts />
        </html>
    )
}

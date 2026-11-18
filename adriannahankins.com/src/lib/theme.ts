import type { SiteDoc } from "@/lib/api/types.ts";

// Tenant theme → CSS custom properties. Components use var(--color-*) and the
// Tailwind `font-serif` / `font-display` utilities (see styles.css). Every
// colour falls back to the original site's look, so a site document only needs
// to set what it changes.

/** CSS variable → [site.theme.colors key, default]. */
const COLOR_VARS: Record<string, [string, string]> = {
    "--color-page": ["background", "#ffffff"],
    "--color-surface": ["paper", "#EDEDED"],
    "--color-text": ["textPrimary", "#000000"],
    "--color-heading": ["heading", "#000000"],
    "--color-muted": ["textSecondary", "#666666"],
    "--color-border": ["border", "#000000"],
    "--color-hover": ["hover", "#ffffff"],
    "--color-menu": ["menu", "#ffffff"],
    "--color-nav": ["nav", "#000000"],
    "--color-margin-red": ["marginRed", "#F67E7E"],
    "--color-margin-blue": ["marginBlue", "#6AAAF6"],
    "--color-disabled": ["disabled", "#E3E3E3"],
    "--color-available": ["available", "#4e9e39"],
    "--color-sold": ["sold", "#c44b57"],
    "--color-highlight": ["highlight", "#FDE26B"],
    "--color-button-bg": ["buttonBackground", "#191515"],
    "--color-button-text": ["buttonText", "#ffffff"],
    "--color-button-secondary-bg": ["buttonSecondaryBackground", "#FFFFFF"],
    "--color-button-secondary-text": ["buttonSecondaryText", "#000000"],
    "--color-button-secondary-border": ["buttonSecondaryBorder", "#C2D6EE"],
};

/** Only allow plain colour values into the stylesheet (no `;`, `}`, `<`, url(), ...). */
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|[a-zA-Z]+)$/;
const SAFE_FONT = /^[\w\s'",.-]+$/;

const quoteFont = (name: string) => (/^[\w-]+$/.test(name) ? name : `"${name.replace(/"/g, "")}"`);

export function themeCss(site: SiteDoc): string {
    const colors = site.theme.colors ?? {};
    const vars = Object.entries(COLOR_VARS).map(([cssVar, [key, fallback]]) => {
        const value = colors[key];
        return `${cssVar}: ${value && SAFE_COLOR.test(value) ? value : fallback};`;
    });

    const { body, heading } = site.theme.fonts ?? {};
    const bodyFont = body && SAFE_FONT.test(body) ? quoteFont(body) : "serif";
    vars.push(`--font-body: ${bodyFont};`);
    vars.push(`--font-heading: ${heading && SAFE_FONT.test(heading) ? quoteFont(heading) : bodyFont};`);

    return `:root { ${vars.join(" ")} }
body { background-color: var(--color-page); color: var(--color-text); }
select option { color: #000000; background-color: #ffffff; } /* native dropdown lists stay legible on any theme */
.text_button { color: var(--color-button-text); }
.text_highlighted { color: var(--color-heading); }
.text_secondary { color: var(--color-muted); }
.icon_active { background-color: ${SAFE_COLOR.test(colors.iconActive ?? "") ? colors.iconActive : "#FFFFE0"}; }`;
}

/** Optional web-font stylesheet (e.g. Google Fonts) for the theme's fonts. */
export function themeFontStylesheet(site: SiteDoc): string | undefined {
    const url = site.theme.fonts?.stylesheet;
    return url && url.startsWith("https://") ? url : undefined;
}

import React, { PropsWithChildren } from "react";
import { getRichFontStyles } from "@/components/typography/richFonts.ts";
import { InlineToken, TokenType } from "@/lib/markdown/tokenizer";
import { Link } from "@tanstack/react-router";
import { Font } from "@/components/typography/fonts.ts";

interface MarkdownTypographyProps extends PropsWithChildren {
    level: Font;
    inlineTokens?: InlineToken[];
}

const isExternalLink = (href?: string) =>
    href?.startsWith('http://') || href?.startsWith('https://') || href?.startsWith('mailto:');

/** "/products?collection=gallery" → { to: "/products", search: { collection: "gallery" } } */
const splitInternalHref = (href: string) => {
    const [to, query = ""] = href.split("?", 2);
    return { to, search: Object.fromEntries(new URLSearchParams(query)) };
};

const renderToken = (token: InlineToken, index: number): React.ReactNode => {
    const linkClass = "underline";

    switch (token.type) {
        case TokenType.LINK:
            if (isExternalLink(token.link_href)) {
                return (
                <a
                    key={index}
                href={token.link_href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                    >
                    {token.value}
            </a>
            );
            }
            const { to, search } = splitInternalHref(token.link_href!);
            return (
                <Link
                    key={index}
                    to={to}
                    search={search}
                    className={linkClass}
                >
                    {token.value}
                </Link>
            );
        case TokenType.BOLD:
            return <strong key={index} className={"font-bold"}>{token.value}</strong>;
        case TokenType.ITALIC:
            return <em key={index} className={"italic"}>{token.value}</em>;
        case TokenType.TEXT:
        default:
            return <React.Fragment key={index}>{token.value}</React.Fragment>;
    }
};

export const MarkdownTypography: React.FC<MarkdownTypographyProps> = ({
                                                                          level,
                                                                          inlineTokens = [],
                                                                      }) => {
    const styles = getRichFontStyles(level);

    const Tag = (['1', '2', '3', '4', '5', '6'].includes(level)
        ? `h${level}`
        : 'p') as keyof React.JSX.IntrinsicElements;

    if (inlineTokens.length === 0) {
        return <Tag className={styles} />;
    }

    return (
        <Tag className={styles}>
            {inlineTokens.map(renderToken)}
        </Tag>
    );
};
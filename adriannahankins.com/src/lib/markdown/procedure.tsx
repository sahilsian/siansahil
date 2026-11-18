import React from "react";
import { Font } from "@/components/typography/fonts.ts";
import { InlineToken } from "./tokenizer";
import { MarkdownTypography } from "@/components/markdownTypography";

const HEADING_FONT_MAP: Record<number, Font> = {
    1: "1",
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
};

export class Procedure {
    static HEADING = (level: number, inlineTokens?: InlineToken[]): React.ReactNode => (
        <MarkdownTypography
            level={HEADING_FONT_MAP[level] || "p"}
            inlineTokens={inlineTokens}
        />
    );

    static PARAGRAPH = (inlineTokens?: InlineToken[]): React.ReactNode => (
        <MarkdownTypography
            level="p"
            inlineTokens={inlineTokens}
        />
    );

    static LIST_ORDERED = (inlineTokens?: InlineToken[]): React.ReactNode => (
        <li>
            <MarkdownTypography
                level="p"
                inlineTokens={inlineTokens}
            />
        </li>
    );

    static LIST_UNORDERED = (inlineTokens?: InlineToken[]): React.ReactNode => (
        <li>
            <MarkdownTypography
                level="p"
                inlineTokens={inlineTokens}
            />
        </li>
    );
}
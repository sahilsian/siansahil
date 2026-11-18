// Markdown tokenizer/lexer
export class Tokenizer {
    markdown: string;
    line: number;

    constructor(markdown: string) {
        this.markdown = markdown;
        this.line = 1;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];
        const lines = this.markdown.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const token = this.createToken(line);

            if (token) {
                tokens.push(token);
            }
        }
        return tokens;
    }

    createToken(line: string): Token | null {
        const type = this.tokenSearch(line);

        switch (type) {
            case "HEADING": {
                return this.createHeadingToken(line);
            }
            case "LIST_ORDERED": {
                return this.createOrderedListToken(line);
            }
            case "LIST_UNORDERED": {
                return this.createUnorderedListToken(line);
            }
            case "PARAGRAPH": {
                return this.createParagraphToken(line);
            }
            default: {
                return null;
            }
        }
    }

    tokenSearch(line: string) {
        if (line.match(/^#{1,6}\s+/)) {
            return TokenType.HEADING;
        }
        if (line.match(/^[-*+]\s+/)) {
            return TokenType.LIST_UNORDERED;
        }
        if (line.match(/^\d+\.\s+/)) {
            return TokenType.LIST_ORDERED;
        }

        return TokenType.PARAGRAPH;
    }

    parseInlineElements(text: string): InlineToken[] {
        const inlineTokens: InlineToken[] = [];
        // One pass over: [label](href) | **bold** | *italic*
        // Bold is tried before italic so "**" is never read as two italics.
        const inlineRegex = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g;

        let lastIndex = 0;
        let match;

        while ((match = inlineRegex.exec(text)) !== null) {

            if (match.index > lastIndex) {
                inlineTokens.push({
                    type: TokenType.TEXT,
                    value: text.slice(lastIndex, match.index),
                    column: lastIndex
                });
            }

            if (match[1] !== undefined) {
                inlineTokens.push({
                    type: TokenType.LINK,
                    value: match[1],
                    link_href: match[2],
                    column: match.index
                });
            } else if (match[3] !== undefined) {
                inlineTokens.push({
                    type: TokenType.BOLD,
                    value: match[3],
                    column: match.index
                });
            } else {
                inlineTokens.push({
                    type: TokenType.ITALIC,
                    value: match[4],
                    column: match.index
                });
            }

            lastIndex = inlineRegex.lastIndex;
        }

        if (lastIndex < text.length) {
            inlineTokens.push({
                type: TokenType.TEXT,
                value: text.slice(lastIndex),
                column: lastIndex
            });
        }

        return inlineTokens;
    }

    createHeadingToken(line: string): Token {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        return {
            type: TokenType.HEADING,
            text_level: match![1].length,
            value: match![2],
            inline_tokens: this.parseInlineElements(match![2]),
            line: this.line,
            column: 0
        };
    }

    createOrderedListToken(line: string): Token {
        const match = line.match(/^\d+\.\s+(.+)$/);
        return {
            type: TokenType.LIST_ORDERED,
            value: match![1],
            inline_tokens: this.parseInlineElements(match![1]),
            line: this.line,
            column: 0
        };
    }

    createUnorderedListToken(line: string): Token {
        const match = line.match(/^[-*+]\s+(.+)$/);
        return {
            type: TokenType.LIST_UNORDERED,
            value: match![1],
            inline_tokens: this.parseInlineElements(match![1]),
            line: this.line,
            column: 0
        };
    }

    createParagraphToken(line: string): Token {
        const parsed = this.parseInlineElements(line);
        const token = {
            type: TokenType.PARAGRAPH,
            value: line,
            inline_tokens: parsed,
            line: this.line,
            column: 0
        };
        return token
    }
}

export enum TokenType {
    HEADING = "HEADING",
    PARAGRAPH = "PARAGRAPH",
    BOLD = "BOLD",
    ITALIC = "ITALIC",
    LIST_ORDERED = "LIST_ORDERED",
    LIST_UNORDERED = "LIST_UNORDERED",
    LINK = "LINK",
    TEXT = "TEXT",
    EOF = "EOF"
}

export interface Token {
    type: TokenType;
    value: string;
    text_level?: number;
    link_href?: string;
    image_alt?: string;
    image_src?: string;
    line: number;
    column: number;
    inline_tokens?: InlineToken[];
}

export interface InlineToken {
    type: TokenType;
    value: string;
    link_href?: string;
    column: number;
}
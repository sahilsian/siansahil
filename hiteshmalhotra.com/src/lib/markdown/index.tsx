import {Token, Tokenizer, TokenType} from "@/lib/markdown/tokenizer.ts";
import {Procedure} from "@/lib/markdown/procedure.tsx";
import {ReactNode} from "react";

type RenderCtx = {
    htmlParts: ReactNode[];
    ulItems: ReactNode[];
    olItems: ReactNode[];
};

// Procedure method implementation
export type RenderProcedure = (token: Token, ctx: RenderCtx) => void;

// Immutable reference
export const GLOBAL_RENDER_ENVIRONMENT: ReadonlyMap<String, RenderProcedure> =
    new Map([
        [TokenType.HEADING, (token, ctx) =>
            ctx.htmlParts.push(
                Procedure.HEADING(token.text_level!, token.inline_tokens)
            )
        ],
        [TokenType.PARAGRAPH, (token, ctx) =>
            ctx.htmlParts.push(
                Procedure.PARAGRAPH(token.inline_tokens)
            )
        ],
        [TokenType.LIST_UNORDERED, (token, ctx) =>
            ctx.ulItems.push(
                Procedure.LIST_UNORDERED(token.inline_tokens)
            )
        ],
        [TokenType.LIST_ORDERED, (token, ctx) =>
            ctx.olItems.push(
                Procedure.LIST_ORDERED(token.inline_tokens)
            )
        ]
    ]);

export class Markdown {
    private renderProcedures: Map<String, RenderProcedure>;

    constructor() {
        this.renderProcedures = new Map(GLOBAL_RENDER_ENVIRONMENT);
    }

    render(markdown: string): ReactNode {
        const tokenizer = new Tokenizer(markdown);
        const tokens = tokenizer.tokenize();

        const ctx: RenderCtx = {
            htmlParts: [],
            ulItems: [],
            olItems: [],
        };

        for (const token of tokens) {
            if (token.type === TokenType.EOF) continue;

            const procedure = this.renderProcedures.get(token.type);
            if (!procedure) throw new Error(`Token type: ${token.type} -> does not exist`);

            this.flushListIfNeeded(token.type, TokenType.LIST_UNORDERED, ctx.ulItems, "ul", ctx.htmlParts);
            this.flushListIfNeeded(token.type, TokenType.LIST_ORDERED, ctx.olItems, "ol", ctx.htmlParts);

            procedure(token, ctx);
        }

        this.flushRemainingLists(ctx);

        return <>{ctx.htmlParts}</>;
    }


    private flushListIfNeeded(
        currentTokenType: TokenType,
        listTokenType: TokenType,
        listItems: ReactNode[],
        htmlTag: "ul" | "ol",
        htmlParts: ReactNode[]
    ) {
        if (currentTokenType !== listTokenType && listItems.length > 0) {
            const ListWrapper = htmlTag; // "ul" | "ol"
            htmlParts.push(
                <ListWrapper key={htmlParts.length}>
                    {listItems.splice(0)}
                </ListWrapper>
            );
        }
    }

    private flushRemainingLists(ctx: RenderCtx) {
        if (ctx.ulItems.length > 0) {
            ctx.htmlParts.push(<ul className={"list-disc list-outside ml-6"} key={ctx.htmlParts.length}>{ctx.ulItems.splice(0)}</ul>);
        }
        if (ctx.olItems.length > 0) {
            ctx.htmlParts.push(<ol key={ctx.htmlParts.length}>{ctx.olItems.splice(0)}</ol>);
        }
    }

}
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Shopify Storefront API — read-only product/variant lookups used to show
// live availability + price on product pages. The Storefront access token is
// designed by Shopify to be public (unlike an Admin API token or a server
// secret), so it's a plain VITE_-prefixed build-time var, not a Worker secret.
const STOREFRONT_API_VERSION = "2024-10";

function getShopifyConfig() {
    const env = (import.meta as any).env;
    return {
        domain: env.VITE_SHOPIFY_STORE_DOMAIN as string | undefined,
        token: env.VITE_SHOPIFY_STOREFRONT_TOKEN as string | undefined,
    };
}

export interface ShopifyVariant {
    id: string; // full gid://shopify/ProductVariant/... — needed as-is for cartCreate's merchandiseId
    title: string;
    price: string;
    currencyCode: string;
    availableForSale: boolean;
}

export interface ShopifyProductData {
    original?: ShopifyVariant;
    prints: ShopifyVariant[];
}

const PRODUCT_QUERY = `
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount currencyCode }
          }
        }
      }
    }
  }
`;

const CART_CREATE_MUTATION = `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { checkoutUrl }
      userErrors { field message }
    }
  }
`;

// Variants are modeled as a single "Format" option (e.g. "Original painting,
// 24 x 30 inches" vs "8.5 x 11 in"), not a separate Type option — so the
// Original variant is identified by matching "original" in its title.
function isOriginalVariant(title: string): boolean {
    return title.toLowerCase().includes("original");
}

function mapVariantEdges(variantEdges: any[]): ShopifyProductData {
    const variants: ShopifyVariant[] = variantEdges.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        price: edge.node.price.amount,
        currencyCode: edge.node.price.currencyCode,
        availableForSale: edge.node.availableForSale,
    }));

    const original = variants.find((v) => isOriginalVariant(v.title));
    const prints = variants.filter((v) => !isOriginalVariant(v.title));

    return { original, prints };
}

// A print variant's title is "Print {size}" (e.g. "Print 8.5 x 11 inches") —
// strip the "Print" word to get just the size for display.
export function printSizeLabel(title: string): string {
    return title.replace(/print/i, "").trim();
}

export const getShopifyProduct = createServerFn({ method: "GET" })
    .inputValidator(z.object({ handle: z.string() }))
    .handler(async ({ data }): Promise<ShopifyProductData | null> => {
        const { domain, token } = getShopifyConfig();
        if (!domain || !token) return null;

        try {
            const response = await fetch(`https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Storefront-Access-Token": token,
                },
                body: JSON.stringify({ query: PRODUCT_QUERY, variables: { handle: data.handle } }),
            });

            if (!response.ok) return null;

            const json = await response.json() as any;
            const variantEdges = json?.data?.product?.variants?.edges ?? [];

            return mapVariantEdges(variantEdges);
        } catch (error) {
            console.error("Shopify product fetch failed", error);
            return null;
        }
    });

// Looks up several products by handle in one request (via aliased queries) —
// used by the listing page, which needs availability/price for every card at
// once rather than one request per product.
export const getShopifyProductsByHandles = createServerFn({ method: "GET" })
    .inputValidator(z.object({ handles: z.array(z.string()) }))
    .handler(async ({ data }): Promise<Record<string, ShopifyProductData | null>> => {
        const { domain, token } = getShopifyConfig();
        if (!domain || !token || data.handles.length === 0) return {};

        const alias = (i: number) => `p${i}`;
        const query = `
          query ProductsByHandles(${data.handles.map((_, i) => `$handle${i}: String!`).join(", ")}) {
            ${data.handles
                .map(
                    (_, i) => `${alias(i)}: product(handle: $handle${i}) {
              variants(first: 20) {
                edges { node { id title availableForSale price { amount currencyCode } } }
              }
            }`
                )
                .join("\n")}
          }
        `;
        const variables = Object.fromEntries(data.handles.map((h, i) => [`handle${i}`, h]));

        try {
            const response = await fetch(`https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Storefront-Access-Token": token,
                },
                body: JSON.stringify({ query, variables }),
            });

            if (!response.ok) return {};

            const json = await response.json() as any;
            const result: Record<string, ShopifyProductData | null> = {};

            data.handles.forEach((handle, i) => {
                const product = json?.data?.[alias(i)];
                result[handle] = product ? mapVariantEdges(product?.variants?.edges ?? []) : null;
            });

            return result;
        } catch (error) {
            console.error("Shopify bulk product fetch failed", error);
            return {};
        }
    });

// Builds the cart via the Storefront API and hands back its hosted checkout
// URL. Checkout is a separate system from the Online Store theme, so this
// works even when the storefront itself is password-protected — unlike the
// legacy `/cart/{variantId}:{qty}` permalink, which renders through the theme
// and gets blocked by the password wall.
export const createShopifyCheckout = createServerFn({ method: "POST" })
    .inputValidator(z.object({ variantId: z.string(), quantity: z.number().optional() }))
    .handler(async ({ data }): Promise<string | null> => {
        const { domain, token } = getShopifyConfig();
        if (!domain || !token) return null;

        try {
            const response = await fetch(`https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Storefront-Access-Token": token,
                },
                body: JSON.stringify({
                    query: CART_CREATE_MUTATION,
                    variables: {
                        lines: [{ merchandiseId: data.variantId, quantity: data.quantity ?? 1 }],
                    },
                }),
            });

            if (!response.ok) return null;

            const json = await response.json() as any;
            const userErrors = json?.data?.cartCreate?.userErrors ?? [];
            if (userErrors.length > 0) {
                console.error("Shopify cartCreate userErrors", userErrors);
                return null;
            }

            return json?.data?.cartCreate?.cart?.checkoutUrl ?? null;
        } catch (error) {
            console.error("Shopify cart creation failed", error);
            return null;
        }
    });

export function formatShopifyPrice(amount: string, currencyCode: string): string {
    const value = parseFloat(amount);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(value);
}

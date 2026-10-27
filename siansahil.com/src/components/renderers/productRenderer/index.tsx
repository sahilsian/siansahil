import ProductLayout from "@/layouts/product";
import BlockRenderer from "@/components/renderers/blockRenderer";
import {Product} from "@/lib/data/interfaces.ts";
import {ShopifyProductData} from "@/lib/shopify";

interface ProductRendererProps {
    product: Product;
    blocks?: any[];
    type: string;
    shop?: ShopifyProductData | null;
}

const ProductRenderer = ({blocks, product, type, shop}:ProductRendererProps) => {
    return <div>
        <ProductLayout
            type={type}
            title={product.title}
            slug={product.slug}
            image={product.image}
            description={product.description}
            tabs={product.tabs}
            dateCreated={product.dateCreated}
            material={product.material}
            shop={shop}
        ></ProductLayout>
        <BlockRenderer blocks={blocks}></BlockRenderer>
    </div>

}

export default ProductRenderer
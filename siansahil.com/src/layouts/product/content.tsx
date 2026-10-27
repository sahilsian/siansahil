import {useState} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import {Media} from "@/layouts/product/media.tsx";
import TabbedContent, {Tab} from "@/components/tabbedContent";
import {useRouter} from "@tanstack/react-router";
import {StrapiImage} from "@/components/image";
import {useAppState} from "@/hooks/useAppState.ts";
import Spinner from "@/components/spinner";
import {createShopifyCheckout, formatShopifyPrice, printSizeLabel, ShopifyProductData} from "@/lib/shopify";

interface ContentProps {
    type?: string;
    title: string;
    slug?: string;
    image: StrapiImage;
    description: string;
    tabs?: Tab[];
    dateCreated?: string;
    material?: string;
    shop?: ShopifyProductData | null;
}

export const Content = ({title, description, image, tabs, material, dateCreated, shop}:ContentProps) => {
    const original = shop?.original;
    const prints = shop?.prints ?? [];
    const router = useRouter()
    const ctx = useAppState()
    const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

    const handleCheckout = async (variantId: string) => {
        setCheckingOutId(variantId);
        try {
            const checkoutUrl = await createShopifyCheckout({ data: { variantId } });
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                setCheckingOutId(null);
            }
        } catch (error) {
            console.error("Checkout failed", error);
            setCheckingOutId(null);
        }
    };

    return (
        <div className={"Product relative z-30"}>
            <div className={"flex"}>
                <div onClick={()=> router.history.back()}>
                    <Typography value={"Back"} level={"button"}></Typography>
                </div>
            </div>
            <Spacer height={"10px"}></Spacer>
            <div className={"flex gap-10 flex-wrap"}>
                <div className={'flex-1'}>
                    <Media image={image}></Media>
                    <Spacer height={"10px"}></Spacer>
                    <div className={'flex gap-3 items-center'}>
                        {dateCreated && <>
                        <Typography level={'6'} value={"Created on: " + dateCreated}></Typography>
                        </>}
                        {material && <>
                        {(material && dateCreated) && <Typography  level={'6'} value={"|"}></Typography> }
                            <Typography level={'6'} value={material}></Typography>
                        </>}
                    </div>
                </div>

                <div className={"flex-2"}>
                    <div className={'flex items-center gap-3'}>
                        <Typography value={title} level={"2"}></Typography>
                        <div className={''}>
                            {ctx.isProcessing && <Spinner></Spinner>}
                        </div>
                    </div>
                    <Typography level={"p"} value={description}></Typography>
                    {/*<div>*/}
                    {/*    <Typography level={"6"} value={`${type}/${slug}`}></Typography>*/}
                    {/*</div>*/}
                    <Spacer height={"20px"}></Spacer>
                    <div className={"ControlGroup flex flex-col gap-4"}>
                        <div className={"flex items-center justify-between gap-4 flex-wrap border border-black px-4 py-3"}>
                            <div className={"flex items-center gap-4"}>
                                {original && (
                                    <>
                                        <Typography level={"6"} value={formatShopifyPrice(original.price, original.currencyCode)} />
                                        {original.availableForSale ? (
                                            <span className={"font-serif text-[1rem] text-[#4e9e39]"}>Available</span>
                                        ) : (
                                            <span className={"font-serif text-[1rem] text-[#c44b57]"}>Sold</span>
                                        )}
                                    </>
                                )}
                            </div>
                            {original?.availableForSale ? (
                                <div
                                    onClick={() => handleCheckout(original.id)}
                                    className={checkingOutId === original.id ? "opacity-50 cursor-wait" : ""}
                                >
                                    <Typography level="button_purchase" value="Purchase" />
                                </div>
                            ) : (
                                <Typography secondary level="button" value="Purchase" className="font-bold cursor-not-allowed" />
                            )}
                        </div>

                        {prints.length > 0 && (
                            <div>
                                <div className={"flex"}>
                                    <Typography className="underline" level={"4"} value={"Prints"} />
                                </div>
                                <table className={"w-full ml-2"}>
                                    <thead>
                                        <tr className={"border-b border-black text-left"}>
                                            <th className={"py-2 pr-4 font-serif font-medium"}>Size</th>
                                            <th className={"py-2 pr-4 font-serif font-medium"}>Price</th>
                                            <th className={"py-2 font-serif font-medium"}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {prints.map((print) => (
                                            <tr key={print.id} className={"border-b border-gray-200"}>
                                                <td className={"py-2 pr-4"}>
                                                    <Typography level={"6"} value={printSizeLabel(print.title)} />
                                                </td>
                                                <td className={"py-2 pr-4"}>
                                                    <Typography level={"6"} value={formatShopifyPrice(print.price, print.currencyCode)} />
                                                </td>
                                                <td className={"py-2"}>
                                                    {print.availableForSale ? (
                                                        <div
                                                            onClick={() => handleCheckout(print.id)}
                                                            className={checkingOutId === print.id ? "opacity-50 cursor-wait" : ""}
                                                        >
                                                            <Typography level="button" value="Purchase" />
                                                        </div>
                                                    ) : (
                                                        <Typography secondary level={"6"} value={"Sold out"} />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {!shop && (
                        <div className={"italic"}>
                            <Typography level={"6"} value={"Shop coming soon."}></Typography>
                        </div>
                    )}
                    <Spacer height={"20px"}></Spacer>
                    <div>
                        <TabbedContent tabs={tabs}></TabbedContent>
                    </div>
                </div>
            </div>
        </div>
    )
}


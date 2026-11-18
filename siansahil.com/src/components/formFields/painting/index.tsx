import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Image from "@/components/image";
import type {PaintingOption} from "@/hooks/useFormControl.ts";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface PaintingFieldProps {
    handleChange: (slug: string) => void,
    value: string,
    label: string
    paintings: PaintingOption[]
    disabled: boolean,
    isRequired: boolean
    error: boolean
}

const PaintingField = ({handleChange, value, label, paintings, error, disabled, isRequired}: PaintingFieldProps) => {
    const {labels} = useSite()
    const selectedTitle = paintings.find((painting) => painting.slug === value)?.title
    const selectedLabel = selectedTitle && <Typography secondary level={'small'} value={`${labels.selected} ${selectedTitle}`}></Typography>
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        {selectedLabel}
        <Spacer height={'10px'}></Spacer>
        {paintings.length === 0 && (
            <Typography secondary level={'6'} value={labels.noPrintablePaintings}></Typography>
        )}
        <div role={"radiogroup"} aria-label={label} className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 ${error && "border-1 border-red-500"}`}>
            {paintings.map((painting) => {
                const selected = value === painting.slug
                const category = painting.category
                return (
                    // Mirrors the Post card (src/components/post) so the picker matches the gallery.
                    <button
                        key={painting.slug}
                        type={"button"}
                        role={"radio"}
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => handleChange(painting.slug)}
                        className={`
                         text-left
                         border-1 border-[#000000]
                         hover:bg-[#ffffff]
                         transition-all
                         ${selected && "bg-[#ffffff] ring-2 ring-[#000000]"}
                         ${disabled ? "bg-[#E3E3E3] text-gray-500 cursor-not-allowed" : "cursor-pointer"}
                         rounded-3xl p-3`}
                    >
                        <Image image={painting.image} className={'rounded-xl w-full aspect-square object-cover object-top'} />
                        <Spacer height={"10px"} />
                        <Typography underline level={"4"} value={painting.title} />
                        <div className={'flex flex-wrap gap-x-2'}>
                            {category && <Typography secondary level={"small"} value={category[0].toUpperCase() + category.slice(1)} />}
                            {painting.dateCreated && <>
                                <Typography secondary level={"small"} value={"|"} />
                                <Typography secondary level={"small"} value={painting.dateCreated} />
                            </>}
                        </div>
                    </button>
                )
            })}
        </div>
        {selectedLabel}
    </div>
}

export default PaintingField

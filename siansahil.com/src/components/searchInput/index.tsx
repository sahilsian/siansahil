import TextInput from "@/components/textInput";
import ControlButton from "@/components/controlButton";
import Typography from "@/components/typography";
import {KeyboardEventHandler} from "react";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface SearchInputProps {
    handleChange: (e:any) => void,
    value: string,
    onSearch: () => void,
    onClear: () => void,
    showClear: boolean
    onEnter: KeyboardEventHandler<HTMLInputElement>
    disabled: boolean
}
const SearchInput = ({disabled, showClear, onEnter, onSearch, onClear, handleChange, value}:SearchInputProps) => {
    const { labels } = useSite()

    return (
        <div className={'flex items-center gap-2 min-w-0'}>
            {/* Text box is the only part that shrinks on narrow screens */}
            <div className={'relative w-[115px] min-w-0 shrink'}>
                <TextInput disabled={disabled} onEnter={onEnter} placeholder={labels.searchPlaceholder} handleChange={handleChange} value={value}></TextInput>
                {/* Reset sits just under the box (absolute) so it never takes width in the row */}
                {showClear && (
                    <button
                        type={"button"}
                        onClick={onClear}
                        className={'absolute left-0 top-full mt-1 font-serif text-[0.75rem] underline text-gray-500 cursor-pointer whitespace-nowrap'}
                    >
                        {labels.reset}
                    </button>
                )}
            </div>
            <div className={'shrink-0'}>
                <ControlButton onClick={onSearch}>
                    <Typography value={labels.search} level={'button'}>
                    </Typography>
                </ControlButton>
            </div>
        </div>
    )
}

export default SearchInput

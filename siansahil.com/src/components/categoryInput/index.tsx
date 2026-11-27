import DropdownInput from "@/components/dropdownInput";
import {DropdownOptionProps} from "@/components/dropdownInput/option.tsx";

interface CategoryInputProps {
    value: string
    handleChange: (e:any) => void
    disabled: boolean
    options: DropdownOptionProps[]
}
const CategoryInput = ({value, handleChange, disabled, options}:CategoryInputProps) => {
    return (
        <div className={` ${disabled && "bg-[var(--color-disabled)] text-[var(--color-muted)]"} transition-all w-[90px] px-[6px] py-[4px] border-b-1 border-[var(--color-border)]`}>
            <DropdownInput className={"w-full truncate outline-none"} value={value} handleChange={handleChange} disabled={disabled} options={options}>
            </DropdownInput>
        </div>
    )
}

export default CategoryInput
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
        <div className={` ${disabled && "bg-[#E3E3E3] text-gray-500"} transition-all w-[90px] px-[6px] py-[4px] border-b-1 border-[#000000]`}>
            <DropdownInput className={"w-full truncate outline-none"} value={value} handleChange={handleChange} disabled={disabled} options={options}>
            </DropdownInput>
        </div>
    )
}

export default CategoryInput
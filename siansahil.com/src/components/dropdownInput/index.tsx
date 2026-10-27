import DropdownOption, {DropdownOptionProps} from "@/components/dropdownInput/option.tsx";
import {ChangeEvent} from "react";

interface DropdownInputProps {
    value: string
    handleChange: (e:ChangeEvent<HTMLSelectElement>) => void,
    disabled: boolean
    options?: DropdownOptionProps[]
    placeholder?: string
    className?: string
}
const DropdownInput = ({value, handleChange, disabled, options, placeholder, className}:DropdownInputProps) => {
    return (
        <div>
            <div >
                <select value={value} onChange={handleChange} disabled={disabled} className={className}>
                    {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
                    {options && options.map((option) => {
                        return <DropdownOption key={option.name} name={option.name}></DropdownOption>
                    })}
                </select>
            </div>
        </div>
    )
}

export default DropdownInput

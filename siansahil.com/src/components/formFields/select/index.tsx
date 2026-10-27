import {ChangeEvent} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import DropdownInput from "@/components/dropdownInput";

interface SelectFieldProps {
    handleChange: (e: ChangeEvent<HTMLSelectElement>) => void,
    value: string,
    label: string
    options: string[]
    disabled: boolean,
    placeholder?: string
    isRequired: boolean
    error: boolean
}

const SelectField = ({handleChange, value, error, label, options, disabled, placeholder, isRequired}: SelectFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`border-1 ${error && "border-red-500"} px-2 py-2 ${disabled && "bg-[#E3E3E3] text-gray-500"}`}>
            <DropdownInput
                value={value}
                handleChange={(e) => handleChange(e)}
                disabled={disabled}
                placeholder={placeholder ?? "Select an option"}
                className={"w-full outline-none bg-transparent"}
                options={options.map((name) => ({name}))}
            ></DropdownInput>
        </div>
    </div>
}

export default SelectField

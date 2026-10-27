import Input from "@/components/input";
import {ChangeEvent} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

interface TelFieldProps {
    handleChange: (e: ChangeEvent<HTMLInputElement>) => void,
    value: string,
    label: string
    disabled: boolean,
    placeholder?: string
    isRequired: boolean
    error: boolean
}

const TelField = ({handleChange, value, error, label, disabled, placeholder, isRequired}: TelFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`border-1 ${error && "border-red-500"} px-2 py-2 ${disabled && "bg-[#E3E3E3] text-gray-500"}`}>
            <Input placeholder={placeholder ?? ""} disabled={disabled} type={"tel"} value={value} handleChange={(e) => handleChange(e)}></Input>
        </div>
    </div>
}

export default TelField

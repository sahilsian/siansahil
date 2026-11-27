import Input from "@/components/input";
import {ChangeEvent} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

interface TextFieldProps {
    handleChange: (e: ChangeEvent<HTMLInputElement>) => void,
    value: string,
    label: string
    disabled: boolean,
    placeholder?: any
    isRequired: boolean
    error: boolean
}

const TextField = ({handleChange, value, error, label, disabled, placeholder, isRequired}: TextFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`border-1 ${error && "border-red-500"} px-2 py-2 ${disabled && "bg-[var(--color-disabled)] text-[var(--color-muted)]"}`}>
            <Input placeholder={placeholder} disabled={disabled} type={"text"} value={value} handleChange={(e) => handleChange(e)}></Input>
        </div>
    </div>
}

export default TextField
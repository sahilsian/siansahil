import {ChangeEvent} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import TextareaBox from "@/components/textareaBox";

interface TextareaFieldProps {
    handleChange: (e: ChangeEvent<HTMLTextAreaElement>) => void,
    value: string,
    label: string
    disabled: boolean,
    placeholder?: any
    isRequired: boolean
    error: boolean
}

const TextareaField = ({handleChange, value, label, error, disabled, placeholder, isRequired}: TextareaFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`border-1 px-2 ${error && "border-red-500"} py-2 ${disabled && "bg-[var(--color-disabled)] text-[var(--color-muted)]"}`}>
            <TextareaBox placeholder={placeholder} disabled={disabled} value={value} handleChange={(e) => handleChange(e)}></TextareaBox>
        </div>
    </div>
}

export default TextareaField
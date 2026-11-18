import Input from "@/components/input";
import {KeyboardEventHandler} from "react";

interface TextInputProps {
    handleChange: (e:any) => void,
    value: string,
    placeholder?: string;
    onEnter: KeyboardEventHandler<HTMLInputElement>;
    disabled: boolean
}

const TextInput = ({disabled, handleChange, value, placeholder="Text Input...", onEnter}:TextInputProps) => {

    return (
        <div className={` ${disabled && "bg-[var(--color-disabled)] text-[var(--color-muted)]"} transition-all w-full px-[6px] py-[4px] border-b-1 border-[var(--color-border)]`}>
            <Input disabled={disabled} onEnter={onEnter} handleChange={handleChange} value={value} placeholder={placeholder} type={"text"}></Input>
        </div>
    )
}

export default TextInput
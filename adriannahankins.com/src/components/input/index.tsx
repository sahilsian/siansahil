import {ChangeEvent, HTMLInputTypeAttribute, KeyboardEventHandler} from "react";

interface InputProps {
    placeholder: string;
    type: HTMLInputTypeAttribute;
    value: string;
    handleChange: (e:ChangeEvent<HTMLInputElement>) => void;
    onEnter?: KeyboardEventHandler<HTMLInputElement>;
    disabled: boolean
}

const Input = ({disabled, placeholder = "text here", type="text", value, handleChange, onEnter}:InputProps) => {
    return <input disabled={disabled} onKeyDown={onEnter} onChange={handleChange} type={type} placeholder={placeholder} value={value} className={'w-full outline-none'} />
}

export default Input
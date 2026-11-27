import {ChangeEvent, KeyboardEventHandler} from "react";

interface TextareaProps {
    placeholder: string;
    value: string;
    handleChange: (e:ChangeEvent<HTMLTextAreaElement>) => void;
    onEnter?: KeyboardEventHandler<HTMLTextAreaElement>;
    disabled: boolean
}

const TextareaBox = ({disabled, placeholder = "text here", value, handleChange, onEnter}:TextareaProps) => {
    return <textarea disabled={disabled} rows={5} onKeyDown={onEnter} onChange={handleChange} placeholder={placeholder} value={value}
                     className={'w-full outline-none resize-y' }
    />
}

export default TextareaBox
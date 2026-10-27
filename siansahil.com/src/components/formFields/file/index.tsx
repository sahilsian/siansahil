import {ChangeEvent, useRef, useState} from "react";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import ControlButton from "@/components/controlButton";

interface FileFieldProps {
    handleChange: (files: File[]) => void,
    value: File[],
    label: string
    disabled: boolean,
    isRequired: boolean
    error: boolean
    accept?: string
    multiple?: boolean
    maxFiles?: number
    maxFileSizeMB?: number
}

// Mirrors the browser's `accept` attribute (e.g. "image/*,application/pdf"),
// since the picker filter alone can be bypassed.
const matchesAccept = (file: File, accept?: string) => {
    if (!accept) return true
    return accept.split(",").map((type) => type.trim()).some((type) =>
        type.endsWith("/*") ? file.type.startsWith(type.slice(0, -1)) : file.type === type
    )
}

const FileField = ({handleChange, value, error, label, disabled, isRequired, accept, multiple, maxFiles = 5, maxFileSizeMB = 5}: FileFieldProps) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const limit = multiple ? maxFiles : 1

    const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? [])
        // reset so picking the same file again still fires onChange
        e.target.value = ""

        const valid = selected.filter((file) => matchesAccept(file, accept) && file.size <= maxFileSizeMB * 1024 * 1024)
        const candidates = multiple ? [...value, ...valid] : valid
        const next = candidates.slice(0, limit)

        setNotice(valid.length < selected.length || next.length < candidates.length
            ? `Some files were skipped — up to ${limit} file${limit > 1 ? "s" : ""}, ${maxFileSizeMB}MB each.`
            : null)
        handleChange(next)
    }

    const handleRemove = (index: number) => {
        setNotice(null)
        handleChange(value.filter((_, i) => i !== index))
    }

    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`border-1 border-dashed ${error && "border-red-500"} px-2 py-4 ${disabled && "bg-[#E3E3E3] text-gray-500"}`}>
            <input
                ref={inputRef}
                type={"file"}
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                onChange={handleSelect}
                className={"hidden"}
            />
            <div className={"w-fit"}>
                <ControlButton onClick={() => !disabled && value.length < limit && inputRef.current?.click()}>
                    <Typography level={'4'} value={value.length > 0 ? "Add more files" : "Choose files"}></Typography>
                </ControlButton>
            </div>
            <Spacer height={'10px'}></Spacer>
            <Typography secondary level={'small'} value={`Up to ${limit} file${limit > 1 ? "s" : ""}, ${maxFileSizeMB}MB each.`}></Typography>
            {value.length > 0 && (
                <ul className={"mt-2"}>
                    {value.map((file, index) => (
                        <li key={`${file.name}-${index}`} className={"flex items-center gap-3"}>
                            <Typography level={'6'} value={file.name}></Typography>
                            {!disabled && (
                                <button type={"button"} onClick={() => handleRemove(index)}>
                                    <Typography level={'button'} value={"Remove"}></Typography>
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
        {notice && <p className={"text-red-500 text-sm mt-1"}>{notice}</p>}
    </div>
}

export default FileField

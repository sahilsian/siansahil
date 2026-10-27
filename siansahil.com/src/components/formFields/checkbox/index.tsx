import Typography from "@/components/typography";

interface CheckboxFieldProps {
    handleChange: (checked: boolean) => void,
    value: boolean,
    label: string
    disabled: boolean,
    isRequired: boolean
    error: boolean
}

const CheckboxField = ({handleChange, value, error, label, disabled, isRequired}: CheckboxFieldProps) => {
    return <div className={'mb-2'}>
        <label className={`flex items-start gap-2 ${error && "border-1 border-red-500 px-2 py-2"} ${disabled ? "text-gray-500 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
                type={"checkbox"}
                checked={value}
                disabled={disabled}
                onChange={(e) => handleChange(e.target.checked)}
                className={"mt-[5px] accent-black"}
            />
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </label>
    </div>
}

export default CheckboxField

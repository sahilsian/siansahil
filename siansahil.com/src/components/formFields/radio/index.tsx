import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

interface RadioFieldProps {
    handleChange: (value: string) => void,
    value: string,
    label: string
    name: string
    options: string[]
    disabled: boolean,
    isRequired: boolean
    error: boolean
}

const RadioField = ({handleChange, value, error, label, name, options, disabled, isRequired}: RadioFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
            { isRequired &&  <span className={"text-red-500"}>*</span> }
        </div>
        <Spacer height={'10px'}></Spacer>
        <div className={`flex flex-wrap gap-x-6 gap-y-2 ${error && "border-1 border-red-500 px-2 py-2"}`}>
            {options.map((option) => (
                <label key={option} className={`flex items-center gap-2 ${disabled ? "text-gray-500 cursor-not-allowed" : "cursor-pointer"}`}>
                    <input
                        type={"radio"}
                        name={name}
                        value={option}
                        checked={value === option}
                        disabled={disabled}
                        onChange={() => handleChange(option)}
                        className={"accent-black"}
                    />
                    <Typography level={'6'} value={option}></Typography>
                </label>
            ))}
        </div>
    </div>
}

export default RadioField

import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

interface RangeFieldProps {
    handleChange: (value: string) => void,
    value: string,
    label: string
    min: number
    max: number
    step?: number
    minLabel: string
    maxLabel: string
    disabled: boolean,
}

const RangeField = ({handleChange, value, label, min, max, step, minLabel, maxLabel, disabled}: RangeFieldProps) => {
    return <div className={'mb-2'}>
        <div className={'flex gap-2'}>
            <Typography level={'4'} value={label}></Typography>
        </div>
        <Spacer height={'10px'}></Spacer>
        <input
            type={"range"}
            min={min}
            max={max}
            step={step ?? 1}
            value={value}
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value)}
            className={`w-full accent-black ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        />
        <div className={'flex justify-between gap-4'}>
            <Typography secondary level={'small'} value={minLabel}></Typography>
            <Typography secondary level={'small'} alignment={'right'} value={maxLabel}></Typography>
        </div>
    </div>
}

export default RangeField

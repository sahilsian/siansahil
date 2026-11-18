import Typography from "@/components/typography";

export interface DropdownOptionProps {
    /** Option value. */
    name: string
    /** Text shown; defaults to `name`. */
    label?: string
}
const DropdownOption = ({name, label}:DropdownOptionProps) => {
    return (
        <option value={name}><Typography level={"6"} value={label ?? name}></Typography></option>
    )
}

export default DropdownOption
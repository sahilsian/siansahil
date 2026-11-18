import ControlButton from "@/components/controlButton";
import Typography from "@/components/typography";

interface SubmitField {
    onClick: ()=> void
    name: string
    disabled: boolean

}

const SubmitField = ({onClick, name, disabled}:SubmitField) => {
    return (
        <div className={`w-full h-full max-w-[200px] cursor-pointer ${disabled && "bg-[#00000030]"}`}>
            <ControlButton
                onClick={onClick}
            >
                <Typography level={"4"} alignment={"center"} value={name}></Typography>
            </ControlButton>
        </div>

    )
}

export default SubmitField
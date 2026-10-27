import {PropsWithChildren} from "react";
import {useAppState} from "@/hooks/useAppState.ts";

interface ControlButtonProps extends PropsWithChildren {
    onClick: () => void,
    secondary?: boolean
}
const ControlButton = ({secondary, onClick, children}:ControlButtonProps) => {
    const ctx = useAppState()
    return (
        <div onClick={onClick} className={`border-1 ${secondary && "border-none"} h-full flex justify-center items-center p-[3px] px-2 hover:bg-white transition-all 
        ${ctx.isProcessing && "bg-[#E3E3E3] text-gray-500"}`}>
            {children}
        </div>
    )
}

export default ControlButton
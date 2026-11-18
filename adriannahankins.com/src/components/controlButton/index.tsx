import {PropsWithChildren} from "react";
import {useAppState} from "@/hooks/useAppState.ts";

interface ControlButtonProps extends PropsWithChildren {
    onClick: () => void,
    secondary?: boolean
}
const ControlButton = ({secondary, onClick, children}:ControlButtonProps) => {
    const ctx = useAppState()
    return (
        <div onClick={onClick} className={`border-1 ${secondary && "border-none"} h-full flex justify-center items-center p-[3px] px-2 hover:bg-[var(--color-hover)] transition-all 
        ${ctx.isProcessing && "bg-[var(--color-disabled)] text-[var(--color-muted)]"}`}>
            {children}
        </div>
    )
}

export default ControlButton
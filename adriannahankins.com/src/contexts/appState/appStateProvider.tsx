import {ReactNode} from "react";
import {useControl} from "@/hooks/useControl.ts";
import {AppStateContext} from "@/contexts/appState/appStateContext.tsx";

interface AppStateProviderProps {
    children: ReactNode
}


export const AppStateProvider = ({children}: AppStateProviderProps) => {
    const controlMachine = useControl()

    return (
        <AppStateContext value={controlMachine}>
            {children}
        </AppStateContext>
    )
}

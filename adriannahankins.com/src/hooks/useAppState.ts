import {useContext} from "react";
import {AppStateContext} from "@/contexts/appState/appStateContext.tsx";

export const useAppState = () => {

    const ctx = useContext(AppStateContext)

    if(!ctx) {
        throw new Error("This component must be in an app state provider.")
    }

    return ctx
}


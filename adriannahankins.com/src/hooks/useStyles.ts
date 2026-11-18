import {StylesContext} from "@/contexts/styles/stylesContext.tsx";
import {useContext} from "react";

export const useStyles = () => {
    const context = useContext(StylesContext)
    if (!context) {
        throw new Error("please use this hook in styles provider")
    }

    return context
}
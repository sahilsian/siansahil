import {useContext} from "react";
import {MenuContext} from "@/contexts/menu/menuContext.tsx";

export const useMobileMenu = () => {
    const ctx = useContext(MenuContext);
    if (ctx === undefined) {
        throw new Error('useMenu must be used within MenuProvider');
    }
    return ctx
}
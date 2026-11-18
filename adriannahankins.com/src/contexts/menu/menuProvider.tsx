import {MenuContext} from "@/contexts/menu/menuContext.tsx";
import {ReactNode, useCallback, useMemo, useState} from "react";

interface MenuProviderProps {
    children: ReactNode,
}

export interface MenuContextProps {
    isMobileMenu: boolean;
    toggleMobileMenu: () => void,
    closeMobileMenu: () => void
}


// ... existing code ...
export const MenuProvider = ({children}: MenuProviderProps) => {
    const [isMobileMenu, setIsMobileMenu] = useState<boolean>(false);

    const toggleMobileMenu = useCallback(() => {
        setIsMobileMenu((p) => !p);
    }, []);

    const closeMobileMenu = useCallback(() => {
        setIsMobileMenu(false);
    }, []);

    const value = useMemo<MenuContextProps>(() => ({
        isMobileMenu,
        toggleMobileMenu,
        closeMobileMenu
    }), [isMobileMenu, toggleMobileMenu, closeMobileMenu]);

    return (
        <MenuContext value={value}>
            {children}
        </MenuContext>
    );
};
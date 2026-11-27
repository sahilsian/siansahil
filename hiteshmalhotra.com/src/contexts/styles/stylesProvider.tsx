import {PropsWithChildren, useMemo} from "react";
import {StylesContext} from "@/contexts/styles/stylesContext.tsx";

export interface StylesContextProps {
    menuHex?: string;
    wrapperHex?: string;
    backgroundHex?: string;
    primaryHex?: string;
    secondaryHex?: string;
    textPrimaryHex?: string;
    textSecondaryHex?: string;
    textButtonHex?: string;
    iconActiveHex?: string;
}


interface StylesProviderProps extends PropsWithChildren {
    colors: StylesContextProps;
}

export const StylesProvider = ({children, colors}: StylesProviderProps) => {
    const value = useMemo<StylesContextProps>(
        () => colors,
        [
            colors.menuHex,
            colors.wrapperHex,
            colors.backgroundHex,
            colors.primaryHex,
            colors.secondaryHex,
            colors.textPrimaryHex,
            colors.textSecondaryHex,
            colors.textButtonHex,
            colors.iconActiveHex
        ]
    )
    return <StylesContext value={value}>
        {children}
    </StylesContext>
}
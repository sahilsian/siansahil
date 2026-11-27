import {PropsWithChildren} from "react";
import {StylesContextProps, StylesProvider} from "@/contexts/styles/stylesProvider.tsx";
import {AppStateProvider} from "@/contexts/appState/appStateProvider.tsx";
import {MenuProvider} from "@/contexts/menu/menuProvider.tsx";

interface ProvidersProps extends PropsWithChildren {
    styles: StylesContextProps,
}
const Providers = ({styles, children}:ProvidersProps) => {
    return (
        <StylesProvider colors={styles}>
            <body>
            <AppStateProvider>
                <MenuProvider>
                    {children}
                </MenuProvider>
            </AppStateProvider>
            </body>
        </StylesProvider>
    )
}

export default Providers
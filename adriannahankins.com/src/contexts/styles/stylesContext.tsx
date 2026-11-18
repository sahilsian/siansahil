import {createContext} from "react";
import {StylesContextProps} from "@/contexts/styles/stylesProvider.tsx";

export const StylesContext = createContext<StylesContextProps|undefined>(undefined)
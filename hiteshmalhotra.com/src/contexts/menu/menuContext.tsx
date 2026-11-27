import {createContext} from "react";
import {MenuContextProps} from "@/contexts/menu/menuProvider.tsx";

export const MenuContext = createContext<MenuContextProps|undefined>(undefined)


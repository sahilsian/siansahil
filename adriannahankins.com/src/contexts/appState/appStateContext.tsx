import {createContext} from "react";
import {ControlInterface} from "@/hooks/useControl.ts";

export const AppStateContext = createContext<ControlInterface | null>(null)
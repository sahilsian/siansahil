import { useEffect } from "react"
import { useRouterState } from "@tanstack/react-router"
import {useAppState} from "@/hooks/useAppState.ts";

const RouterSync = () => {
    const controlMachine = useAppState()
    const status = useRouterState({ select: (s) => s.status })

    useEffect(() => {
        if (status === "pending") controlMachine.setLoading()
        else if (status === "idle") controlMachine.setSuccess()
    }, [status])

    return null
}

export default RouterSync

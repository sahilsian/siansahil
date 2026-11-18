'use client'
import {ControlInterface} from "@/hooks/useControl.ts";
import { useRouterState } from "@tanstack/react-router";
import {ComponentType, useEffect} from "react";

interface InjectedProps {
    controlMachine: ControlInterface
}

// depreciated for now
export const withRouterLoading = <P extends InjectedProps>(
    Component: ComponentType<P & InjectedProps>
) => {
    return function WithRouterLoadingComponent(props: P) {
        const routerState = useRouterState()
        useEffect(() => {
            switch (routerState.status) {
                case "idle":
                    props.controlMachine.setSuccess();
                    break;
                case "pending":
                    props.controlMachine.setLoading();
                    break;
            }
        }, [routerState.status]);

        return (
            // I love spread
            <Component {...props} />
        )

    }
}
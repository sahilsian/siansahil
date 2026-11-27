'use client'
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ComponentType } from "react";

export interface RouterInjectedProps {
    goToPost: (slug: string) => void;
    navigate: ReturnType<typeof useNavigate>;
    location: ReturnType<typeof useLocation>;
}

export const withRouter = <P extends object>(
    Component: ComponentType<P & RouterInjectedProps>
) => {
    return function WithRouterComponent(props: P) {
        const navigate = useNavigate()
        const location = useLocation()

        const goToPost = (slug: string) => {
            const currentPath = location.pathname.replace(/\/$/, "")
            navigate({ to: `${currentPath}/${slug}` })
        };

        return (
            <Component
                {...props}
                navigate={navigate}
                location={location}
                goToPost={goToPost}
            />
        )
    }
}

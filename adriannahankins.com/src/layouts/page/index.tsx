import {PropsWithChildren} from "react";
import {Background} from "@/layouts/form/background.tsx";
import {Content} from "@/layouts/form/content.tsx";

interface PageLayoutProps extends PropsWithChildren {
    title: string;
    description: string;
}

// Standard page shell shared with Contact (form layout): grey paper background,
// red/blue margin lines, and the typewriter title + description sitting on them.
// Use this for every new page; put the page body in children.
const PageLayout = ({title, description, children}: PageLayoutProps) => {
    return (
        <div className={"Page lg:px-22 px-6 pb-22 relative min-h-screen"}>
            <Background></Background>
            <Content title={title} description={description}></Content>
            <div className={"z-[30] relative w-full"}>
                {children}
            </div>
        </div>
    )
}

export default PageLayout

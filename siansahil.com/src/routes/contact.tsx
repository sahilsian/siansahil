import { createFileRoute } from '@tanstack/react-router'
import Screen from "@/components/screen";
import Typography from "@/components/typography";

export const Route = createFileRoute('/contact')({
    component: RouteComponent,
    head: () => {
        return {
            meta: [
                { title: "Contact — Sahil Sian" },
                { name: "description", content: "sahilsiantech@gmail.com" },
            ]
        }
    }
})

function RouteComponent() {
    return (
        <Screen classOverride={"min-h-screen"}>
            <div className={"w-full flex justify-center items-center text-center px-6"}>
                <a href={"mailto:sahilsiantech@gmail.com"}>
                    <Typography level={"2"} underline value={"Shoot me an email at sahilsiantech@gmail.com"}></Typography>
                </a>
            </div>
        </Screen>
    )
}

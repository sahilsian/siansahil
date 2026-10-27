import { createFileRoute } from '@tanstack/react-router'
import Screen from "@/components/screen";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

export const Route = createFileRoute('/privacy-policy')({
    component: RouteComponent,
    head: () => {
        return {
            meta: [
                { title: "Privacy Policy — Sahil Sian" },
                { name: "description", content: "How Sahil Sian's website collects, uses, and protects your information." },
            ]
        }
    }
})

const SECTION_SPACING = "20px"

function RouteComponent() {
    return (
        <Screen classOverride={"min-h-screen"}>
            <div className={"w-full px-6 lg:px-22 py-22 max-w-[800px] mx-auto"}>
                <Typography level={"2"} value={"Privacy Policy"}></Typography>
                <Typography level={"6"} value={"Last updated: October 25, 2026"}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"p"} value={"This policy explains what information siansahil.com collects, how it's used, and who it's shared with. This site is a personal art portfolio with a small shop for original paintings and prints."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Information We Collect"}></Typography>
                <Typography level={"p"} value={"We collect information you provide directly: your email address if you sign up for the mailing list, and your name/email/message if you use the contact form. We do not use cookies, analytics, or tracking scripts on this site."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"How We Use Your Information"}></Typography>
                <Typography level={"p"} value={"Mailing list signups and contact form submissions are used only to send you updates you've asked for, or to respond to your message. We do not sell or rent your information to anyone."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Purchases Through Shopify"}></Typography>
                <Typography level={"p"} value={"When you purchase a painting or print, checkout happens entirely on Shopify's own secure platform: payment, shipping, and billing details are collected and processed by Shopify, not stored on this site. That portion of your data is governed by Shopify's own privacy policy, available at "}></Typography>
                <a href={"https://www.shopify.com/legal/privacy"} target={"_blank"} rel={"noreferrer"}>
                    <Typography underline level={"p"} value={"shopify.com/legal/privacy"}></Typography>
                </a>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Email Delivery"}></Typography>
                <Typography level={"p"} value={"Contact form and mailing list emails are delivered using Resend, an email delivery service. Resend processes the email address and message content solely to deliver that email."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Your Rights"}></Typography>
                <Typography level={"p"} value={"You can unsubscribe from the mailing list or ask us to delete your information at any time by emailing sahilsiantech@gmail.com."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Changes to This Policy"}></Typography>
                <Typography level={"p"} value={"If this policy changes, the \"last updated\" date above will be updated accordingly."}></Typography>
                <Spacer height={SECTION_SPACING}></Spacer>

                <Typography level={"3"} value={"Contact"}></Typography>
                <a href={"mailto:sahilsiantech@gmail.com"}>
                    <Typography underline level={"p"} value={"sahilsiantech@gmail.com"}></Typography>
                </a>
            </div>
        </Screen>
    )
}

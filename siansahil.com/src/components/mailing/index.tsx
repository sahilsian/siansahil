import {ChangeEvent} from "react";
import {Link} from "@tanstack/react-router";
import {FormProps, useFormControl} from "@/hooks/useFormControl.ts";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Input from "@/components/input";
import SubmitField from "@/components/formFields/submit";
import {useSite} from "@/contexts/site/siteContext.tsx";
import {subscribeToMailingList} from "@/lib/api/client.ts";

interface MailingProps {
    /** The tenant's mailing-list form (site.mailing.formId): an email field + a submit field. */
    form: FormProps
}

const Mailing = ({form}: MailingProps) => {
    const site = useSite()
    const emailConfig = form.fields.find((field) => field.metadata.fieldType === "email")
    // Signups go to the content server (stored per tenant; it emails the
    // tenant a notification), not through the Resend form handler.
    const formController = useFormControl({
        formSchema: form,
        submit: async (values) => emailConfig ? subscribeToMailingList(String(values[emailConfig.id] ?? "")) : false,
    })
    const submitConfig = form.fields.find((field) => field.metadata.fieldType === "submit")
    const emailField = emailConfig ? formController.state.runtimeFields.get(emailConfig.id) : undefined
    const disabled = formController.isProcessing || formController.state.mode === "success"

    if (!emailConfig) return null

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        formController.writeField(emailConfig.id, e.target.value)
    }

    return (
        <div className="w-full">
        <div className={"min-w-[300px] max-w-[720px] w-full p-4 m-auto"}>
            <Typography level={"3"} alignment="center" value={site.mailing.title}></Typography>
            <Typography level={"p"} alignment="center" value={site.mailing.description}></Typography>
            <Spacer height={"10px"}></Spacer>
            <div className={"flex w-full gap-2 items-stretch"}>
                <div className={`flex-3 border-1 px-2 py-2 ${disabled && "bg-[#E3E3E3] text-gray-500"}`}>
                    <Input
                        placeholder={(emailConfig as { placeholder?: string }).placeholder ?? ""}
                        type={"email"}
                        disabled={disabled}
                        value={(emailField?.value as string | undefined) ?? ""}
                        handleChange={handleChange}
                    ></Input>
                </div>
                <div className="flex-1">
                <SubmitField
                    onClick={() => formController.submitForm()}
                    name={submitConfig?.name ?? ""}
                    disabled={disabled}
                ></SubmitField>
                </div>
            </div>
            {(emailField?.error && emailField.touched) && (
                <p className={"text-red-500 text-sm mt-1"}>{emailField.error}</p>
            )}
            {formController.state.mode === "success" && form.successMessage && (
                <Typography level={"6"} className="p-2" alignment="center" value={form.successMessage}></Typography>
            )}
            {formController.state.mode === "error" && (
                <Typography level={"6"} className="p-2" alignment="center" value={form.errorMessage ?? site.messages.formError}></Typography>
            )}
            <Spacer height={"10px"}></Spacer>
            <div className={"flex gap-1 flex-wrap justify-center items-center"}>
                <Typography secondary level={"6"} alignment="center" value={site.mailing.consentPrefix}></Typography>
                <Link to={site.mailing.consentLink.to}>
                    <Typography secondary underline level={"6"} value={site.mailing.consentLink.label}></Typography>
                </Link>
            </div>
        </div>
        </div>

    )
}

export default Mailing

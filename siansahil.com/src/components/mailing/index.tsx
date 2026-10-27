import {ChangeEvent} from "react";
import {Link} from "@tanstack/react-router";
import {FormProps, useFormControl} from "@/hooks/useFormControl.ts";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";
import Input from "@/components/input";
import SubmitField from "@/components/formFields/submit";

const MAILING_FORM_SCHEMA: FormProps = {
    documentId: "mailing-list",
    title: "Mailing List",
    description: "Sign up for occasional updates on new paintings and prints.",
    image: {url: "", width: 0, height: 0, name: ""},
    fields: [
        {
            id: "email",
            name: "Email",
            className: "",
            disabled: false,
            placeholder: "hello@world.com",
            required: true,
            metadata: {fieldType: "email"},
        },
        {
            id: "submit",
            name: "Send",
            className: "",
            disabled: false,
            placeholder: "",
            metadata: {fieldType: "submit"},
        },
    ],
}

const Mailing = () => {
    const formController = useFormControl({formSchema: MAILING_FORM_SCHEMA})
    const emailField = formController.state.runtimeFields.get("email")
    const disabled = formController.isProcessing || formController.state.mode === "success"

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        formController.writeField("email", e.target.value)
    }

    return (
        <div className="w-full">
        <div className={"min-w-[300px] max-w-[720px] w-full p-4 m-auto"}>
            <Typography level={"3"} alignment="center" value={"Mailing List"}></Typography>
            <Typography level={"p"} alignment="center" value={"Sign up for updates on new paintings and prints."}></Typography>
            <Spacer height={"10px"}></Spacer>
            <div className={"flex w-full gap-2 items-stretch"}>
                <div className={`flex-3 border-1 px-2 py-2 ${disabled && "bg-[#E3E3E3] text-gray-500"}`}>
                    <Input
                        placeholder={"hello@world.com"}
                        type={"email"}
                        disabled={disabled}
                        value={(emailField?.value as string | undefined) ?? ""}
                        handleChange={handleChange}
                    ></Input>
                </div>
                <div className="flex-1">
                <SubmitField
                    onClick={() => formController.submitForm()}
                    name={"Send"}
                    disabled={disabled}
                    
                ></SubmitField>
                </div>
            </div>
            {(emailField?.error && emailField.touched) && (
                <p className={"text-red-500 text-sm mt-1"}>{emailField.error}</p>
            )}
            {formController.state.mode === "success" && (
                <Typography level={"6"} className="p-2" alignment="center" value={"Thanks for subscribing!"}></Typography>
            )}
            {formController.state.mode === "error" && (
                <Typography level={"6"} className="p-2" alignment="center" value={"Something went wrong. Please try again."}></Typography>
            )}
            <Spacer height={"10px"}></Spacer>
            <div className={"flex gap-1 flex-wrap justify-center items-center"}>
                <Typography secondary level={"6"} alignment="center" value={"By subscribing you agree to my"}></Typography>
                <Link to={"/privacy-policy"}>
                    <Typography secondary underline level={"6"} value={"Privacy Policy"}></Typography>
                </Link>
            </div>
        </div>
        </div>

    )
}

export default Mailing

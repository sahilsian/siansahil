import FormLayout from "@/layouts/form";
import {FieldValue, FormProps} from "@/hooks/useFormControl.ts";

interface FormRendererProps {
    type: string
    form: FormProps
    initialValues?: Record<string, FieldValue>
}

const FormRenderer = ({type, form, initialValues}:FormRendererProps) => {
    return <FormLayout initialValues={initialValues} image={form.image} type={type} form={form} formTitle={form.title} formDescription={form.description}/>
}

export default FormRenderer
import {FieldValue, FormProps, useFormControl} from "@/hooks/useFormControl.ts";
import FieldRenderer from "@/components/renderers/fieldRenderer";
interface FieldsProps {
    formSchema: FormProps
    initialValues?: Record<string, FieldValue>
}

export const FormFields = ({formSchema, initialValues}:FieldsProps) => {
    const formController = useFormControl({formSchema, initialValues})
    return (
        <div className={'w-full flex-2'}>
            <FieldRenderer formController={formController}>
            </FieldRenderer>
        </div>

    )
}
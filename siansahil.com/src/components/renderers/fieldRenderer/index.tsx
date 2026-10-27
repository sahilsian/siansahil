import {Fragment} from "react";
import TextField from "@/components/formFields/text";
import EmailField from "@/components/formFields/email";
import TextareaField from "@/components/formFields/textarea";
import TelField from "@/components/formFields/tel";
import DateField from "@/components/formFields/date";
import SelectField from "@/components/formFields/select";
import RadioField from "@/components/formFields/radio";
import CheckboxField from "@/components/formFields/checkbox";
import FileField from "@/components/formFields/file";
import RangeField from "@/components/formFields/range";
import SubmitField from "@/components/formFields/submit";
import {
    ComponentFormCheckboxField,
    ComponentFormDateField,
    ComponentFormDropdownField,
    ComponentFormEmailField,
    ComponentFormFileField,
    ComponentFormRadioField,
    ComponentFormRangeField,
    ComponentFormTelField,
    ComponentFormTextareaField,
    ComponentFormTextField,
    FieldState,
    FieldValue,
    FormControlInterface,
    isFieldVisible
} from "@/hooks/useFormControl.ts";
import Typography from "@/components/typography";
import Spacer from "@/components/spacer";

interface FieldRendererProps {
    formController: FormControlInterface
}
const FieldRenderer = ({formController}: FieldRendererProps) => {
    const {state} = formController
    const disabled = formController.isProcessing || state.mode == 'success'

    const write = (id: string, value: FieldValue) => {
        formController.writeField(id, value)
    }

    const handleSubmission = () => {
        formController.submitForm();
    }

    const renderField = (fieldState: FieldState, hasError: boolean) => {
        const {config} = fieldState
        switch (config.metadata.fieldType) {
            case "text": {
                const field = config as ComponentFormTextField
                return <TextField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    placeholder={field.placeholder}
                    error={hasError}
                    isRequired={!!field.required}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "email": {
                const field = config as ComponentFormEmailField
                return <EmailField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    placeholder={field.placeholder ?? ""}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "tel": {
                const field = config as ComponentFormTelField
                return <TelField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    placeholder={field.placeholder}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "date": {
                const field = config as ComponentFormDateField
                return <DateField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "textarea": {
                const field = config as ComponentFormTextareaField
                return <TextareaField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    placeholder={field.placeholder}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "dropdown": {
                const field = config as ComponentFormDropdownField
                return <SelectField
                    label={field.name}
                    options={field.options}
                    disabled={disabled}
                    value={fieldState.value as string}
                    placeholder={field.placeholder}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(e) => write(field.id, e.target.value)}
                />
            }
            case "radio": {
                const field = config as ComponentFormRadioField
                return <RadioField
                    label={field.name}
                    name={field.id}
                    options={field.options}
                    disabled={disabled}
                    value={fieldState.value as string}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(value) => write(field.id, value)}
                />
            }
            case "checkbox": {
                const field = config as ComponentFormCheckboxField
                return <CheckboxField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as boolean}
                    isRequired={!!field.required}
                    error={hasError}
                    handleChange={(checked) => write(field.id, checked)}
                />
            }
            case "file": {
                const field = config as ComponentFormFileField
                return <FileField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as File[]}
                    isRequired={!!field.required}
                    error={hasError}
                    accept={field.accept}
                    multiple={field.multiple}
                    maxFiles={field.maxFiles}
                    maxFileSizeMB={field.maxFileSizeMB}
                    handleChange={(files) => write(field.id, files)}
                />
            }
            case "range": {
                const field = config as ComponentFormRangeField
                return <RangeField
                    label={field.name}
                    disabled={disabled}
                    value={fieldState.value as string}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    minLabel={field.minLabel}
                    maxLabel={field.maxLabel}
                    handleChange={(value) => write(field.id, value)}
                />
            }
            case "submit": {
                return <SubmitField
                    onClick={handleSubmission}
                    name={config.name}
                    disabled={disabled}
                />
            }

            default:
                return <div>Field not supported.</div>
        }
    }

    const visibleFields = Array
        .from(state.runtimeFields.values())
        .filter((fieldState) => isFieldVisible(fieldState.config, state.runtimeFields))

    return (
        <div>
            {visibleFields.map((fieldState, index) => {
                const {config} = fieldState
                const showSectionHeading = !!config.section && config.section !== visibleFields[index - 1]?.config.section
                const hasError = !!(fieldState.error && fieldState.touched)
                return (
                    <Fragment key={config.id}>
                        {showSectionHeading && (
                            <div className={`${index > 0 ? 'mt-10' : ''} mb-4 pb-2 border-b-1 border-[#000000]`}>
                                <Typography level={'3'} value={config.section}></Typography>
                            </div>
                        )}
                        <div className={config.metadata.fieldType === 'submit' ? 'mt-8' : 'mb-4'}>
                            {renderField(fieldState, hasError)}
                            {config.note && (
                                <Typography secondary level={'small'} value={config.note}></Typography>
                            )}
                            {hasError && (
                                <p className="text-red-500 text-sm mb-5">{fieldState.error}</p>
                            )}
                        </div>
                    </Fragment>
                )
            })}
            <Spacer height={'10px'}></Spacer>
            {state.mode == 'invalid' && <p className="text-red-500 text-sm">Please fix the highlighted fields above.</p> }
            {state.mode == 'success' && <Typography level={'4'} value={state.formSchema.successMessage ?? "Form Successfully Submitted."}/> }
            {state.mode == 'error' && <Typography level={'4'} value={"Error submitting form."}/> }
        </div>
    )
}
export default FieldRenderer

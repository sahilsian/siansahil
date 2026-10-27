// (Q, Σ, δ, q₀, F)
// Q = Finite States that Exist
// Σ = Actions
// δ = Transition
// q₀ = Initial State

import {StrapiImage} from "@/components/image";
import { submitForm } from "@/lib/data/mutations/mutations";
import {useEffect, useReducer} from "react";

// Form

export type Mode =
    'pristine'
    | 'dirty'
    | 'validating'
    | 'invalid'
    | 'valid'
    | 'submitting'
    | 'success'
    | 'error'
    | 'loading'

export type FieldTypes = 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'dropdown' | 'radio' | 'checkbox' | 'file' | 'range'

export type FieldValue = string | boolean | File[]

export interface FormProps {
    documentId: string
    title: string
    description: string
    image?: StrapiImage
    fields: Fields[]
    successMessage?: string
}

// A field with showIf is hidden — and skipped by validation and submission —
// unless the referenced field's current value equals `equals`.
interface FieldCondition {
    fieldId: string
    equals: string | boolean
}

interface ComponentFormBase {
    id: string;
    name: string;
    className?: string;
    section?: string;
    showIf?: FieldCondition;
    note?: string;
}

export interface ComponentFormTextField extends ComponentFormBase {
    disabled?: boolean;
    placeholder?: string;
    metadata: {
        fieldType: 'text'
    }
    required?: boolean
}

export interface ComponentFormDropdownField extends ComponentFormBase {
    options: string[]
    placeholder?: string
    disabled?: boolean
    metadata: {
        fieldType: 'dropdown'
    }
    required?: boolean
}

export interface ComponentFormTextareaField extends ComponentFormBase {
    disabled?: boolean;
    placeholder?: string;
    metadata: {
        fieldType: 'textarea'
    }
    required?: boolean
}

export interface ComponentFormEmailField extends ComponentFormBase {
    disabled?: boolean;
    placeholder?: string;
    metadata: {
        fieldType: 'email'
    }
    required?: boolean
}

export interface ComponentFormTelField extends ComponentFormBase {
    disabled?: boolean;
    placeholder?: string;
    metadata: {
        fieldType: 'tel'
    }
    required?: boolean
}

export interface ComponentFormDateField extends ComponentFormBase {
    disabled?: boolean;
    metadata: {
        fieldType: 'date'
    }
    required?: boolean
}

export interface ComponentFormRadioField extends ComponentFormBase {
    options: string[]
    disabled?: boolean;
    metadata: {
        fieldType: 'radio'
    }
    required?: boolean
}

export interface ComponentFormCheckboxField extends ComponentFormBase {
    disabled?: boolean;
    metadata: {
        fieldType: 'checkbox'
    }
    required?: boolean
}

export interface ComponentFormFileField extends ComponentFormBase {
    disabled?: boolean;
    accept?: string;
    multiple?: boolean;
    maxFiles?: number;
    maxFileSizeMB?: number;
    metadata: {
        fieldType: 'file'
    }
    required?: boolean
}

export interface ComponentFormRangeField extends ComponentFormBase {
    disabled?: boolean;
    min: number;
    max: number;
    step?: number;
    defaultValue?: number;
    minLabel: string;
    maxLabel: string;
    metadata: {
        fieldType: 'range'
    }
}

export interface ComponentFormSubmitField extends ComponentFormBase {
    disabled?: boolean;
    placeholder?: string;
    metadata: {
        fieldType: 'submit'
    }
}

export type Fields =
    ComponentFormTextField
    | ComponentFormDropdownField
    | ComponentFormTextareaField
    | ComponentFormEmailField
    | ComponentFormTelField
    | ComponentFormDateField
    | ComponentFormRadioField
    | ComponentFormCheckboxField
    | ComponentFormFileField
    | ComponentFormRangeField
    | ComponentFormSubmitField

// State

interface State {
    mode: Mode,
    formSchema: FormProps
    runtimeFields: Map<string, FieldState>
    submitCount: number
    error?: string
}

export interface FieldState {
    config: Fields
    id: string
    value: FieldValue
    error?: string
    touched: boolean
    dirty: boolean
}


// Σ Actions

export enum ACTIONS_LIST {
    WRITE_FIELD = "WRITE_FIELD",
    SUBMIT_FORM = "SUBMIT_FORM",
    SET_PRISTINE = "SET_PRISTINE",
    SET_DIRTY = "SET_DIRTY",
    SET_VALIDATING = "SET_VALIDATING",
    SET_VALID = "SET_VALID",
    SET_INVALID = "SET_INVALID",
    SET_SUBMITTING = "SET_SUBMITTING",
    SET_SUCCESS = "SET_SUCCESS",
    SET_ERROR = "SET_ERROR",
    SET_LOADING = "SET_LOADING"
}

type Action_WriteField = {
    type: ACTIONS_LIST.WRITE_FIELD
    cargo: {
        fieldID: string
        value: FieldValue
    }
}

type Action_SubmitForm = {
    type: ACTIONS_LIST.SUBMIT_FORM
}

type Action_SetPristine = {
    type: ACTIONS_LIST.SET_PRISTINE
}

type Action_SetDirty = {
    type: ACTIONS_LIST.SET_DIRTY
}

type Action_SetValidating = {
    type: ACTIONS_LIST.SET_VALIDATING
}

type Action_SetValid = {
    type: ACTIONS_LIST.SET_VALID
}

type Action_SetInvalid = {
    type: ACTIONS_LIST.SET_INVALID
}

type Action_SetSubmitting = {
    type: ACTIONS_LIST.SET_SUBMITTING
}

type Action_SetSuccess = {
    type: ACTIONS_LIST.SET_SUCCESS
}

type Action_SetError = {
    type: ACTIONS_LIST.SET_ERROR
}

type Action_SetLoading = {
    type: ACTIONS_LIST.SET_LOADING
}

type Action = Action_WriteField |
    Action_SubmitForm |
    Action_SetPristine |
    Action_SetDirty |
    Action_SetValidating |
    Action_SetValid |
    Action_SetInvalid |
    Action_SetSubmitting |
    Action_SetSuccess |
    Action_SetError |
    Action_SetLoading


const transitionFunc = (state:State, action:Action): State => {
    switch (action.type) {
        case ACTIONS_LIST.WRITE_FIELD:
            const originalField = state.runtimeFields.get(action.cargo.fieldID)

            // guard because typescript errors keep me up at night
            if(!originalField) {
                throw new Error("Seems like this field never existed in the first place oops :(")
            }

            const newFieldValue:FieldState = {
                ...originalField,
                value: action.cargo.value,
                error: undefined
            }

            // avoid directly mutating the state
            const newFields = new Map(state.runtimeFields)
            newFields.set(action.cargo.fieldID, newFieldValue)

            return {
                ...state,
                mode: 'dirty',
                runtimeFields: newFields,
                error: ""

            }
        case ACTIONS_LIST.SUBMIT_FORM:
            if (state.mode == 'success') {
                return {
                    ...state
                }
            }
            const err = validateForm(state.runtimeFields)
            if(err.size > 0) {
                const newFields = new Map(state.runtimeFields)
                newFields.forEach((fieldState, fieldId) => {
                    newFields.set(fieldId, {
                        ...fieldState,
                        error: err.get(fieldId),
                        touched: true,
                    })
                })

                return {
                    ...state,
                    mode: 'invalid',
                    runtimeFields: newFields,
                }
            }
            return {
                ...state,
                mode: 'submitting',
                submitCount: state.submitCount + 1,
            }

        case ACTIONS_LIST.SET_PRISTINE:
            return {
                ...state,
                mode: "pristine"
            }

        case ACTIONS_LIST.SET_DIRTY:
            return {
                ...state,
                mode: "dirty"
            }

        case ACTIONS_LIST.SET_VALIDATING:
            return {
                ...state,
                mode: "validating"
            }

        case ACTIONS_LIST.SET_VALID:
            return {
                ...state,
                mode: "valid"
            }
        case ACTIONS_LIST.SET_INVALID:
            return {
                ...state,
                mode: "invalid"
            }

        case ACTIONS_LIST.SET_SUBMITTING:
            return {
                ...state,
                mode: "submitting"
            }
        case ACTIONS_LIST.SET_SUCCESS:
            return {
                ...state,
                mode: "success"
            }

        case ACTIONS_LIST.SET_ERROR:
            return {
                ...state,
                mode: "error"
            }

        case ACTIONS_LIST.SET_LOADING:
            return {
                ...state,
                mode: "loading"
            }
        default: {
            return state
        }
    }
}

export interface FormControlInterface {
    state:State,
    isProcessing: boolean,
    writeField: (fieldID:string, value:FieldValue) => void
    submitForm: () => void
    setPristine: () => void
    setDirty: () => void
    setValidating: () => void
    setValid: () => void
    setInvalid: () => void
    setSubmitting: () => void
    setSuccess: () => void
    setError: () => void
    setLoading: () => void
}

interface FormControlProps {
    formSchema: FormProps
}

const getInitialValue = (field: Fields): FieldValue => {
    switch (field.metadata.fieldType) {
        case 'checkbox':
            return false
        case 'file':
            return []
        case 'range': {
            const range = field as ComponentFormRangeField
            return String(range.defaultValue ?? Math.round((range.min + range.max) / 2))
        }
        default:
            return ""
    }
}

const initializeForm = (formSchema:FormProps):State => {
    const fields = new Map<string, FieldState>
    console.log(formSchema)
    formSchema.fields.forEach((field) => {
        fields.set(field.id, {
            id: field.id,
            config: field,
            value: getInitialValue(field),
            touched: false,
            dirty: false
        })
    })


    return {
        mode: 'pristine',
        formSchema: formSchema,
        runtimeFields: fields,
        submitCount: 0,
    }
}

export const isFieldVisible = (field: Fields, fields: Map<string, FieldState>): boolean => {
    if (!field.showIf) return true
    return fields.get(field.showIf.fieldId)?.value === field.showIf.equals
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isEmpty = (value: FieldValue): boolean => {
    if (typeof value === "boolean") return !value
    if (Array.isArray(value)) return value.length === 0
    return !value.trim()
}

const validateField = (field: Fields, value: FieldValue): string | undefined => {
    if ("required" in field && field.required && isEmpty(value)) {
        return field.metadata.fieldType === 'checkbox'
            ? "Please check this box to continue"
            : `${field.name} is required`
    }
    if (field.metadata.fieldType === 'email' && typeof value === 'string' && value.trim() && !EMAIL_PATTERN.test(value.trim())) {
        return "Please enter a valid email address"
    }
    return undefined
}

const validateForm = (fields: Map<string, FieldState>): Map<string, string> => {
    const errors = new Map<string, string>()

    fields.forEach((fieldState, fieldId) => {
        if (!isFieldVisible(fieldState.config, fields)) return
        const error = validateField(fieldState.config, fieldState.value)
        if (error) {
            errors.set(fieldId, error)
        }
    })
    return errors
}

const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    // result is a data URL ("data:image/jpeg;base64,....") — keep only the base64 part
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
})

const toSubmissionValue = async (fieldState: FieldState) => {
    const {config, value} = fieldState

    if (Array.isArray(value)) {
        return Promise.all(value.map(async (file) => ({
            filename: file.name,
            contentType: file.type,
            content: await readFileAsBase64(file),
        })))
    }

    if (config.metadata.fieldType === 'range') {
        const range = config as ComponentFormRangeField
        return `${value} of ${range.max} (${range.min} = ${range.minLabel}, ${range.max} = ${range.maxLabel})`
    }

    return value
}

const buildSubmissionPayload = async (state: State) => {
    const submittableFields = Array
        .from(state.runtimeFields.values())
        .filter((fieldState) => fieldState.config.metadata.fieldType !== 'submit')
        .filter((fieldState) => isFieldVisible(fieldState.config, state.runtimeFields))

    const fields = await Promise.all(submittableFields.map(async (fieldState) => ({
        fieldId: fieldState.config.id,
        fieldName: fieldState.config.name,
        fieldType: fieldState.config.metadata.fieldType as FieldTypes,
        section: fieldState.config.section,
        value: await toSubmissionValue(fieldState),
    })));

    return {
        formId: state.formSchema.documentId,
        formTitle: state.formSchema.title,
        payload: {
            fields: fields,
        },
        metadata: {
            userAgent: navigator.userAgent,
            submittedAt: new Date().toISOString(),
            submissionAttempt: state.submitCount + 1,
            ...(document.referrer && { referrer: document.referrer })
        },
    };
};

export const useFormControl = ({formSchema}:FormControlProps):FormControlInterface => {
    const initialState = initializeForm(formSchema);

    const [state, dispatch] = useReducer(transitionFunc, initialState)

    const isProcessing = ['validating', 'submitting', 'loading', 'valid'].includes(state.mode);

    useEffect(() => {
        if (state.mode === 'submitting') {
            const submitToStrapi = async () => {
                try {
                    const submissionPayload = await buildSubmissionPayload(state)

                    const result = await submitForm({
                        data: submissionPayload
                    });

                    if (result.success) {
                        dispatch({ type: ACTIONS_LIST.SET_SUCCESS })
                    } else {
                        throw new Error('Submission failed')
                    }
                } catch (error) {
                    dispatch({
                        type: ACTIONS_LIST.SET_ERROR,
                    });
                }
            };

            submitToStrapi();
        }
    }, [state.mode]);

    return {
        state,
        isProcessing,
        writeField: (fieldID:string, value:FieldValue) => dispatch({type: ACTIONS_LIST.WRITE_FIELD, cargo: { fieldID, value }}),
        submitForm: () => dispatch({type: ACTIONS_LIST.SUBMIT_FORM}),
        setPristine: () => dispatch({type: ACTIONS_LIST.SET_PRISTINE}),
        setDirty: () => dispatch({type: ACTIONS_LIST.SET_DIRTY}),
        setValidating: () => dispatch({type: ACTIONS_LIST.SET_VALIDATING}),
        setValid: () => dispatch({type: ACTIONS_LIST.SET_VALID}),
        setInvalid: () => dispatch({type: ACTIONS_LIST.SET_INVALID}),
        setSubmitting: () => dispatch({type: ACTIONS_LIST.SET_SUBMITTING}),
        setSuccess: () => dispatch({type: ACTIONS_LIST.SET_SUCCESS}),
        setError: () => dispatch({type: ACTIONS_LIST.SET_ERROR}),
        setLoading: () => dispatch({type: ACTIONS_LIST.SET_PRISTINE})
    }
}

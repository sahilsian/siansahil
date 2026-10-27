import {Content} from "@/layouts/form/content.tsx";
import {Background} from "@/layouts/form/background.tsx";
import {FormFields} from "@/layouts/form/formFields.tsx";
import {FormImage} from "@/layouts/form/formImage.tsx";
import {FormProps} from "@/hooks/useFormControl.ts";
import {StrapiImage} from "@/components/image";

interface FormLayoutProps {
    type: string;
    formTitle: string;
    formDescription: string;
    form: FormProps;
    image?: StrapiImage
}


const FormLayout = ({type, formTitle, formDescription, form, image}:FormLayoutProps) => {
    return (
        <div className={`Form ${type} lg:px-22 px-6 pb-22 bg-[#EDEDED] relative`}>
            <Background></Background>
            {image ? (
                <>
                    <Content title={formTitle} description={formDescription}></Content>
                    <div className={'flex z-[30] gap-10 relative w-full'}>
                        <FormFields formSchema={form}></FormFields>
                        <FormImage image={image}></FormImage>
                    </div>
                </>
            ) : (
                <>
                    <div className={'w-full max-w-[720px] mx-auto'}>
                        <Content title={formTitle} description={formDescription}></Content>
                    </div>
                    <div className={'z-[30] relative w-full max-w-[720px] mx-auto'}>
                        <FormFields formSchema={form}></FormFields>
                    </div>
                </>
            )}
        </div>
    )
}

export default FormLayout

import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";

const FieldSubmissionSchema = z.object({
    fieldId: z.string(),
    fieldName: z.string(),
    fieldType: z.enum(['text', 'email', 'textarea', 'dropdown']),
    value: z.union([z.string(), z.boolean(), z.array(z.string())]),
})

const MetadataSchema = z.object({
    userAgent: z.string(),
    submittedAt: z.string(),
    submissionAttempt: z.number(),
    referrer: z.string().optional(),
})

const SubmissionInputSchema = z.object({
    formId: z.string(),
    payload: z.object({
        fields: z.array(FieldSubmissionSchema),
    }),
    metadata: MetadataSchema,
})

// Submission recipient. Not a secret, so it's fine as a literal — the
// secret is the Resend API key below.
const SUBMISSION_RECIPIENT = "sahilsiantech@gmail.com";

const formatFieldValue = (value: string | boolean | string[]): string => {
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
};

// Replaces the old Strapi `createSubmission` GraphQL mutation. Submissions
// now go out as an email via Resend instead of being stored in the CMS.
// Requires RESEND_API_KEY to be set as a Cloudflare Worker secret
// (`wrangler secret put RESEND_API_KEY`) — it must never be a VITE_-prefixed
// var, since those get bundled into client-visible code.
export const submitForm = createServerFn()
    .inputValidator(SubmissionInputSchema)
    .handler(async ({ data }) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error("RESEND_API_KEY is not configured");
        }

        const fieldLines = data.payload.fields
            .map((field) => `${field.fieldName}: ${formatFieldValue(field.value)}`)
            .join("\n");

        const text = [
            `New form submission (form: ${data.formId})`,
            "",
            fieldLines,
            "",
            "---",
            `Submitted: ${data.metadata.submittedAt}`,
            `User agent: ${data.metadata.userAgent}`,
            data.metadata.referrer ? `Referrer: ${data.metadata.referrer}` : undefined,
        ].filter(Boolean).join("\n");

        try {
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: "Portfolio contact form <onboarding@resend.dev>",
                    to: [SUBMISSION_RECIPIENT],
                    subject: `New submission — form ${data.formId}`,
                    text,
                }),
            });

            if (!response.ok) {
                throw new Error(`Resend API responded with ${response.status}`);
            }

            const result = await response.json() as { id?: string };

            return {
                success: true as const,
                submission: result,
            };
        } catch (error) {
            throw new Error('Failed to submit form');
        }
    });

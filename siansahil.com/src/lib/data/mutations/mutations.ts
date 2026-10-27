import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";

const AttachmentSchema = z.object({
    filename: z.string(),
    contentType: z.string(),
    content: z.string(),
})

const FieldSubmissionSchema = z.object({
    fieldId: z.string(),
    fieldName: z.string(),
    fieldType: z.enum(['text', 'email', 'tel', 'date', 'textarea', 'dropdown', 'radio', 'checkbox', 'file', 'range']),
    section: z.string().optional(),
    value: z.union([z.string(), z.boolean(), z.array(z.string()), z.array(AttachmentSchema)]),
})

const MetadataSchema = z.object({
    userAgent: z.string(),
    submittedAt: z.string(),
    submissionAttempt: z.number(),
    referrer: z.string().optional(),
})

const SubmissionInputSchema = z.object({
    formId: z.string(),
    formTitle: z.string().optional(),
    payload: z.object({
        fields: z.array(FieldSubmissionSchema),
    }),
    metadata: MetadataSchema,
})

type Attachment = z.infer<typeof AttachmentSchema>
type FieldValue = z.infer<typeof FieldSubmissionSchema>["value"]

// Submission recipient. Not a secret, so it's fine as a literal — the
// secret is the Resend API key below.
const SUBMISSION_RECIPIENT = "sahilsiantech@gmail.com";

// Resend caps a whole email (attachments included, base64-encoded) at 40MB.
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isAttachmentList = (value: FieldValue): value is Attachment[] =>
    Array.isArray(value) && value.length > 0 && typeof value[0] === "object";

const formatFieldValue = (value: FieldValue): string => {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (isAttachmentList(value)) {
        return `${value.length} attached (${value.map((file) => file.filename).join(", ")})`;
    }
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
    return value.trim() ? value : "—";
};

// Replaces the old Strapi `createSubmission` GraphQL mutation. Submissions
// now go out as an email via Resend instead of being stored in the CMS.
// Requires RESEND_API_KEY to be set as a Cloudflare Worker secret
// (`wrangler secret put RESEND_API_KEY`) — it must never be a VITE_-prefixed
// var, since those get bundled into client-visible code.
// POST so file attachments travel in the body rather than the URL.
export const submitForm = createServerFn({ method: "POST" })
    .inputValidator(SubmissionInputSchema)
    .handler(async ({ data }) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error("RESEND_API_KEY is not configured");
        }

        const { fields } = data.payload;

        const attachments = fields.flatMap((field) => isAttachmentList(field.value) ? field.value : []);
        const attachmentBytes = attachments.reduce((total, file) => total + (file.content.length * 3) / 4, 0);
        if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
            throw new Error("Attachments are too large");
        }

        const fieldLines: string[] = [];
        let currentSection: string | undefined;
        fields.forEach((field) => {
            if (field.section && field.section !== currentSection) {
                currentSection = field.section;
                fieldLines.push("", `— ${field.section.toUpperCase()} —`);
            }
            fieldLines.push(`${field.fieldName}: ${formatFieldValue(field.value)}`);
        });

        const formLabel = data.formTitle ?? `form ${data.formId}`;

        const text = [
            `New ${formLabel} submission`,
            ...fieldLines,
            "",
            "---",
            `Submitted: ${data.metadata.submittedAt}`,
            `User agent: ${data.metadata.userAgent}`,
            data.metadata.referrer ? `Referrer: ${data.metadata.referrer}` : undefined,
        ].filter((line) => line !== undefined).join("\n");

        const submitterEmail = fields.find((field) =>
            field.fieldType === "email" && typeof field.value === "string" && EMAIL_PATTERN.test(field.value.trim())
        )?.value as string | undefined;

        const submitterName = fields.find((field) => field.fieldId === "name" && typeof field.value === "string")?.value as string | undefined;

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
                    subject: `New ${formLabel} submission${submitterName?.trim() ? ` — ${submitterName.trim()}` : ""}`,
                    text,
                    ...(submitterEmail && { reply_to: submitterEmail.trim() }),
                    ...(attachments.length > 0 && {
                        attachments: attachments.map((file) => ({ filename: file.filename, content: file.content })),
                    }),
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

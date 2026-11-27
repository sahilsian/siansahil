import {useEffect, useRef, useState, type FormEvent} from "react";
import {submitForm} from "@/lib/data/mutations/mutations";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface InquiryButtonProps {
    /** The painting being asked about. */
    title: string;
    /** Text on the trigger, e.g. "Inquire" or "inquire". */
    label: string;
    /** Classes for the trigger (looks like a link or a button, depending on where it sits). */
    className?: string;
    /**
     * What's being asked about: the original painting (default), a print of it, or any
     * gallery item (e.g. an event to book; see theme.itemInquiry), worded from the site's settings.
     */
    kind?: "original" | "print" | "item";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Inquire" that opens a pop-up form asking about the original painting and its
 * price. Sent by email the same way as the contact form, with the painting named.
 */
export const InquiryButton = ({title, label, className, kind = "original"}: InquiryButtonProps) => {
    const {messages, labels, terms} = useSite();
    // "Event", "Painting", ...: names the item in the email the site owner receives.
    const itemWord = terms?.item ? terms.item[0].toUpperCase() + terms.item.slice(1) : "Item";
    const dialog = useRef<HTMLDialogElement>(null);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [problem, setProblem] = useState<string | null>(null);

    useEffect(() => {
        const el = dialog.current;
        if (!el) return;
        if (open && !el.open) el.showModal();
        if (!open && el.open) el.close();
    }, [open]);

    const start = () => {
        setMessage(
            kind === "print" ? `Hello, I'd like to buy the print “${title}”. Is it still available?`
            : kind === "item" ? (labels.inquiryMessage ?? "Hello, I'd like to ask about “{title}”.").replaceAll("{title}", title)
            : `Hello, I'm interested in the original painting “${title}”. Could you tell me the price and whether it's still available?`);
        setState("idle");
        setProblem(null);
        setOpen(true);
    };

    const send = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !EMAIL.test(email.trim()) || !message.trim()) {
            setProblem("Please add your name, a valid email and a message.");
            return;
        }
        setProblem(null);
        setState("sending");
        try {
            const result = await submitForm({
                data: {
                    formId: kind === "print" ? "print-inquiry" : kind === "item" ? "item-inquiry" : "original-inquiry",
                    formTitle: kind === "print" ? `Print inquiry: ${title}` : kind === "item" ? `${itemWord} inquiry: ${title}` : `Original inquiry: ${title}`,
                    payload: {
                        fields: [
                            {fieldId: "painting", fieldName: kind === "print" ? "Print" : kind === "item" ? itemWord : "Painting", fieldType: "text", value: title},
                            {fieldId: "name", fieldName: "Name", fieldType: "text", value: name.trim()},
                            {fieldId: "email", fieldName: "Email", fieldType: "email", value: email.trim()},
                            {fieldId: "message", fieldName: "Message", fieldType: "textarea", value: message.trim()},
                        ],
                    },
                    metadata: {
                        userAgent: navigator.userAgent,
                        submittedAt: new Date().toISOString(),
                        submissionAttempt: 1,
                        referrer: window.location.href,
                    },
                },
            });
            setState(result.success ? "sent" : "error");
        } catch {
            setState("error");
        }
    };

    const input = "w-full border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] px-3 py-2 font-serif text-[1rem] outline-none focus:ring-2 focus:ring-[var(--color-hover)]";

    return (
        <>
            <button type="button" onClick={start} className={className ?? "underline"}>{label}</button>
            <dialog
                ref={dialog}
                onClose={() => setOpen(false)}
                onCancel={() => setOpen(false)}
                className={"m-auto w-[calc(100%-2rem)] max-w-lg bg-[var(--color-surface)] p-0 text-[var(--color-text)] backdrop:bg-black/50"}
            >
                <div className={"p-6 font-serif"}>
                    <div className={"flex items-start justify-between gap-4"}>
                        <h2 className={"text-[1.5rem] leading-tight"}>Inquire about “{title}”</h2>
                        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className={"text-[1.5rem] leading-none"}>×</button>
                    </div>

                    {state === "sent" ? (
                        <div className={"mt-4 space-y-4"}>
                            <p>Thank you. Your inquiry has been sent, and you'll get a reply by email.</p>
                            <button type="button" onClick={() => setOpen(false)} className={"underline"}>Close</button>
                        </div>
                    ) : (
                        <form onSubmit={send} className={"mt-4 space-y-3"} noValidate>
                            <label className={"block"}>
                                <span className={"block text-[0.9rem] mb-1"}>Name</span>
                                <input className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </label>
                            <label className={"block"}>
                                <span className={"block text-[0.9rem] mb-1"}>Email</span>
                                <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </label>
                            <label className={"block"}>
                                <span className={"block text-[0.9rem] mb-1"}>Message</span>
                                <textarea className={`${input} min-h-32`} value={message} onChange={(e) => setMessage(e.target.value)} required />
                            </label>
                            {(problem || state === "error") && (
                                <p role="alert" className={"text-[0.95rem] text-[var(--color-sold)]"}>{problem ?? messages.formError}</p>
                            )}
                            <button
                                type="submit"
                                disabled={state === "sending"}
                                className={"border border-[var(--color-border)] px-4 py-2 transition-colors hover:bg-[var(--color-button-bg)] hover:text-[var(--color-button-text)] disabled:opacity-50"}
                            >
                                {state === "sending" ? "Sending…" : "Send inquiry"}
                            </button>
                        </form>
                    )}
                </div>
            </dialog>
        </>
    );
};

export default InquiryButton;

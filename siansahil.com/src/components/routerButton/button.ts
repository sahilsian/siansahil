export type ButtonType = "primary" | "secondary";

export const getButtonType = (type: ButtonType): string => {
    const common = "px-8 rounded-full py-2 flex items-center gap-2 cursor-pointer transition-colors duration-300 outline-none";

    const variant = {
        // Colours come from the tenant theme (site.theme.colors → CSS variables in __root).
        primary: "border border-[var(--color-button-bg)] bg-[var(--color-button-bg)] text-[var(--color-button-text)]",
        secondary: "border bg-[var(--color-button-secondary-bg)] border-[var(--color-button-secondary-border)] text-[var(--color-button-secondary-text)]",
    }[type];

    return `${common} ${variant}`;
};

import Icon from "../Icon";
import Typography from "../typography";
import { ButtonType, getButtonType } from "./button";
import { Link } from "@tanstack/react-router";
import {useAppState} from "@/hooks/useAppState.ts";

export interface ButtonData {
    id: number;
    variant: ButtonType;
    label: string;
    target: "internal" | "external";
    route: string | null;
    // Query params for internal routes, e.g. { collection: "gallery" } on /products
    search?: Record<string, string>;
    icon?: {
        component: React.ReactElement<React.SVGProps<SVGSVGElement>>;
        size: "small" | "medium" | "large";
    } | null;
}

interface Props {
    button: ButtonData;
    onClick?: () => void;
    disabled?: boolean;
}

const Button = ({ button, onClick, disabled }: Props) => {
    const { variant, icon, label, route, target, search } = button;
    const classes = getButtonType(variant);
    const ctx = useAppState()
    // Action
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={`${classes} ${ctx.isProcessing && "bg-[#E3E3E3] text-gray-500"} ${disabled ? "opacity-50 !cursor-not-allowed" : ""}`}
            >
                {icon && <Icon size={icon.size} icon={icon.component} />}
                <Typography button={variant === "primary"} level="button" value={label} className={disabled ? "!cursor-not-allowed" : ""} />
            </button>
        );
    }

    // External
    if (target === "external" && route) {
        return (
            <a href={route} target="_blank" rel="noopener noreferrer">
                <button className={`${classes} ${ctx.isProcessing && "bg-[#E3E3E3] text-gray-500"}`}>
                    {icon && <Icon size={icon.size} icon={icon.component} />}
                    <Typography button={variant === "primary"} level="button" value={label} />
                </button>
            </a>
        );
    }

    // Internal
    return (
        <Link to={route || "/"} search={search || {}}>
            <button className={`${classes}  ${ctx.isProcessing && "bg-[#E3E3E3] text-gray-500"}`}>
                {icon && <Icon size={icon.size} icon={icon.component} />}
                <Typography button={variant === "primary"} level="button" value={label} />
            </button>
        </Link>
    );
};

export default Button;

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
    icon?: {
        component: React.ReactElement<React.SVGProps<SVGSVGElement>>;
        size: "small" | "medium" | "large";
    } | null;
}

interface Props {
    button: ButtonData;
}

const Button = ({ button }: Props) => {
    const { variant, icon, label, route, target } = button;
    const classes = getButtonType(variant);
    const ctx = useAppState()
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
        <Link to={route || "/"}>
            <button className={`${classes}  ${ctx.isProcessing && "bg-[#E3E3E3] text-gray-500"}`}>
                {icon && <Icon size={icon.size} icon={icon.component} />}
                <Typography button={variant === "primary"} level="button" value={label} />
            </button>
        </Link>
    );
};

export default Button;

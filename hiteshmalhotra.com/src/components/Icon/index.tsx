import * as React from "react";

type Sizes = "small" | "medium" | "large"

interface IconProps {
    icon: React.ReactElement;
    size?: Sizes;
}

const sizeClasses = {
    small: "w-4 h-4",
    medium: "w-6 h-6",
    large: "w-8 h-8"
}

const Icon = ({icon, size = "medium"}: IconProps) => {
    if (!React.isValidElement(icon)) {
        console.error('Icon must be a valid React element');
        return null;
    }

    return (
        <div className={`${sizeClasses[size]}`}>
            {icon}
        </div>
    );
}

export default Icon
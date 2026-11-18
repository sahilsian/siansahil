import Icon from "@/components/Icon";
import * as React from "react";

interface IconButton {
    icon: React.ReactElement
    onClick: (e:any) => void
    active: boolean
}

const IconButton = ({icon, onClick, active}:IconButton) => {
    return (
        <div
            style={{}}
            className={`p-1 border-1 flex items-center justify-center hover:cursor-pointer hover:opacity-70 ${active && "icon_active"}`}
            onClick={onClick}
        >
            <Icon icon={icon} size={"medium"}></Icon>
        </div>
    )
}

export default IconButton
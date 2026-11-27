import IconButton from "@/components/iconButton";
import {ControlInterface, Views, VIEWS} from "@/hooks/useControl.ts";
import {Columns3, Grid3x3} from "lucide-react";

interface CustomizeViewportProps {
    controlMachine: ControlInterface
    onClick: (view:Views) => void
}
const CustomizeViewport = ({ controlMachine, onClick }: CustomizeViewportProps) => {
    const viewConfig = {
        // "post" = 3 per row, "list" = denser 4 per row (key kept for existing URLs/state)
        post: { icon: <Columns3 />, value: "post" },
        list: { icon: <Grid3x3 />, value: "list" }
    };

    return (
        <div className={'flex gap-2'}>
            {VIEWS.map(view => (
                <IconButton
                    active={controlMachine.state.view === view}
                    key={view}
                    icon={viewConfig[view].icon}
                    onClick={()=> onClick(view)}
                />
            ))}
        </div>
    );
}

export default CustomizeViewport
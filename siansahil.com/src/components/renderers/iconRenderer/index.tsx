import {Github, Linkedin, Instagram, Twitter, Mail, Globe} from "lucide-react";
import Icon from "@/components/Icon";

export interface IconRendererProps {
    iconName: string;
}

const IconRenderer = ({iconName}: IconRendererProps) => {
    switch (iconName?.toLowerCase()) {
        case 'github': return <Icon icon={<Github />} />;
        case 'linkedin': return <Icon icon={<Linkedin />} />;
        case 'instagram': return <Icon icon={<Instagram />} />;
        case 'twitter':
        case 'x': return <Icon icon={<Twitter />} />;
        case 'email':
        case 'mail': return <Icon icon={<Mail />} />;
        default: return <Icon icon={<Globe />} />;
    }
}

export default IconRenderer

import IconRenderer from "@/components/renderers/iconRenderer";

export interface SocialItem {
    url: string;
    iconName: string;
}

interface SocialRowProps {
    icons?: SocialItem[];
}

const SocialRow = ({icons}: SocialRowProps) => {
    if (!icons || icons.length === 0) return null;

    return (
        <div className={"flex items-center gap-4"}>
            {icons.map((item, idx) => (
                <a key={`${item.iconName}-${idx}`} href={item.url} target={"_blank"} rel={"noreferrer"}>
                    <IconRenderer iconName={item.iconName} />
                </a>
            ))}
        </div>
    )
}

export default SocialRow

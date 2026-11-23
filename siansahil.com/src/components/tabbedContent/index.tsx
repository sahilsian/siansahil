import { useState, type ReactNode } from "react";
import Typography from "@/components/typography";
import RichText from "@/components/richText";

export interface TabbedContentProps {
    tabs?: Tab[]
    /** Shown under the tab buttons, above the selected tab's text. */
    header?: ReactNode
}

export interface Tab {
    title: string;
    richDescription: string;
}

const TabbedContent = ({ tabs, header }: TabbedContentProps) => {
    const [activeTitle, setActiveTitle] = useState(tabs?.[0]?.title);
    if (!tabs || tabs.length === 0) return header ? <div className="py-6">{header}</div> : null;

    return (
        <div>
            <div className="flex gap-4 border-b border-black">
                {tabs.map((tab) => (
                    <button
                        key={tab.title}
                        onClick={() => setActiveTitle(tab.title)}
                        className={`px-5 py-1 rounded-t-2xl transition-colors ${
                            activeTitle === tab.title
                                ? 'border-1 border-black text-black'
                                : 'border-1 border-gray-300 text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <Typography level="button" value={tab.title} />
                    </button>
                ))}
            </div>

            <div className="py-6">
                {header && <div className="mb-6">{header}</div>}
                {tabs.map((tab) => (
                    <div
                        key={tab.title}
                        style={{
                            display: activeTitle === tab.title ? 'block' : 'none'
                        }}
                    >
                        <RichText richText={tab.richDescription}></RichText>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TabbedContent;

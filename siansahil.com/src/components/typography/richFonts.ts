
// For rich text
import {Font} from "@/components/typography/fonts.ts";

export const RICH_FONT_STYLES_MAP: Record<Font, string> = {
    "1": "text-[1.7rem] lg:text-[2.1rem] font-medium leading-[1.2] mb-5 font-serif",
    "2": "text-[1.5rem] lg:text-[1.7rem] leading-[1.2] mb-[0.8rem] font-normal font-serif",
    "3": "text-[1.2rem] mb-3 font-semibold font-serif",
    "4": "text-[1rem] font-medium leading-[1.4] font-serif",
    "5": "text-[0.9rem] font-medium leading-[1.5] font-serif",
    "6": "text-[0.8rem] font-medium leading-[1.5] font-serif",
    "small": "text-[0.7rem] font-medium leading-[1.5] font-serif",
    "p": "text-[0.95rem] md:text-[1.1rem] font-normal font-serif mb-5",
    "button": "text-[0.95rem] cursor-pointer font-normal font-serif underline",
    "button_purchase": "text-[0.95rem] cursor-pointer font-bold font-serif underline",
};

export const getRichFontStyles = (value: Font) => RICH_FONT_STYLES_MAP[value] || "";

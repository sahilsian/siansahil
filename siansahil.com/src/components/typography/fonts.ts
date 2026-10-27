export type Font = '1' | '2' | '3' | '4' | '5' | '6' | 'small' | 'p' | 'button' | 'button_purchase'

export const FONT_STYLES_MAP: Record<Font, string> = {
    "1": " text-[3rem] lg:text-[7rem] font-medium leading-[1.2] font-serif ",
    "2": " text-[2.2rem] lg:text-[3rem] leading-[1.2] mb-[1rem]  font-normal font-serif",
    "3": " lg:text-[1.75rem] text-[1.3rem] mb-[0.2rem] font-medium font-serif",
    "4": " text-[1rem] font-medium leading-[1.4] font-serif",
    "5": " text-[1rem] font-medium leading-[1.5] font-serif",
    "6": " text-[1rem] font-medium leading-[1.5] font-serif",
    "small": " text-[0.8rem] font-medium leading-[1.5] font-serif",
    "p": " text-[1rem] md:text-[1.3rem] font-normal font-serif",
    "button": "text-[1rem] cursor-pointer font-normal font-serif underline",
    'button_purchase': "text-[1rem] cursor-pointer font-bold font-serif underline"
}

export const getFontStyles = (value: Font) => FONT_STYLES_MAP[value] || ""

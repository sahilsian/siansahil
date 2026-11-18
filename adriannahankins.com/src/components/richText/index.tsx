import useMarkdownParser from "@/hooks/useMarkdownParser.ts";


interface RichTextProps {
    richText: string;
}

const RichText = ({richText}:RichTextProps) => {
    const html = useMarkdownParser(richText)
    return <div>{html}</div>
}

export default RichText
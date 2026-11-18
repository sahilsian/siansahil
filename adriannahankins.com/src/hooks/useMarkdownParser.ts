// Sahil Sian 2025

import {useMemo} from "react";
import {Markdown} from "@/lib/markdown";
const useMarkdownParser = (markdown:string) => {
    return useMemo(() => {
        return new Markdown().render(markdown)
    }, [markdown])
}

export default useMarkdownParser
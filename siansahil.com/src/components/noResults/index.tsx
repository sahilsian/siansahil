import Typography from "@/components/typography";
import {useSite} from "@/contexts/site/siteContext.tsx";

const NoResults = () => {
    const { labels } = useSite()
    return (
        <div className={"py-5"}>
            <Typography value={labels.noResults}></Typography>
        </div>
    )
}

export default NoResults

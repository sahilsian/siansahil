import {PaginationButton} from "@/components/pagination/button.tsx";
import {ReactNode} from "react";
import Typography from "@/components/typography";

/**
 * Pagination metadata for a paginated collection.
 */
export interface PageInfoProps {
    /**
     * The current page index (1-based).
     */
    page: number;

    /**
     * Total number of pages available.
     */
    pageCount?: number;

    /**
     * Number of items displayed per page.
     */
    pageSize: number;

    /**
     * Total number of items across all pages.
     */
    total: number;
}

interface PaginationProps extends PageInfoProps {
}
const Pagination = ({ page, pageCount, pageSize, total}:PaginationProps):React.JSX.Element => {

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    const createButtonElements = (pageCount:number):ReactNode => {
        var elements = []

        for(let i:number = 0; i < pageCount; i++) {
            elements.push(<PaginationButton key={i+1} pageSize={pageSize} selectedPage={page} idx={i+1}></PaginationButton>)
        }

        return elements
    }
    return (
        <div className={'flex-col sm:flex-row flex sm:gap-6'}>
            <div className={"flex flex-nowrap items-center gap-[5px]"}>
                <Typography level={'6'} value={`${start}-${end}`}></Typography>
                <Typography level={'6'} value={"of"}></Typography>
                <Typography level={'6'} value={total.toString()}></Typography>
            </div>
            <div className={'flex gap-2'}>
                {
                    createButtonElements(pageCount || 0)
                }
            </div>
        </div>
    )
}

export default Pagination
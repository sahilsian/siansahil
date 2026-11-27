import Typography from "@/components/typography";
import {Link} from "@tanstack/react-router";

interface PaginationButton {
    idx:number,
    selectedPage: number,
    pageSize: number
}
export const PaginationButton = ({pageSize, idx, selectedPage}:PaginationButton) => {

    return (
        <Link to={'.'} search={(search) => ({ ...search, page: idx, pageSize: pageSize })}>
            <div className={"hover:opacity-70 cursor-pointer"}>
                <Typography highlighted={idx == selectedPage} underline level={"6"} value={idx.toString()}></Typography>
            </div>
        </Link>

    )
}
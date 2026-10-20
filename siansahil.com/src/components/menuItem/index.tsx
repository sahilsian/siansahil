import {Link} from "@tanstack/react-router";
import Typography from "@/components/typography";

export interface MenuItemProps {
    id: number;
    displayName: string;
    slug: string;
    category: string;
    lg?: boolean
    search?: Record<string, string>
}
const MenuItem = ({displayName, slug, lg, search}:MenuItemProps) => {

    return (
        <div>
            <Link
                to={slug}
                search={search || {}}
                params={{}}
            >
                <Typography underline={lg} level={lg ? "4" :"button"} value={displayName}>
                </Typography>
            </Link>
        </div>
    )
}

export default MenuItem


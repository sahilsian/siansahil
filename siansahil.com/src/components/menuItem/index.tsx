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

    // Full URLs (e.g. Instagram) open in a new tab; on phones the https link
    // hands off to the installed app instead of the mobile site.
    if (slug.startsWith("http")) {
        return (
            <div>
                <a href={slug} target={"_blank"} rel={"noopener noreferrer"}>
                    <Typography underline={lg} level={lg ? "4" :"button"} value={displayName}>
                    </Typography>
                </a>
            </div>
        )
    }

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


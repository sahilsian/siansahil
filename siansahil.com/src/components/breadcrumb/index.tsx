import {Fragment} from "react";
import {Link} from "@tanstack/react-router";

export interface Crumb {
    label: string;
    /** Omit for the current page (last crumb). */
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
}

/** "Gallery › Girl › Prints" — every crumb but the last is a link. */
const Breadcrumb = ({items}: {items: Crumb[]}) => (
    <nav aria-label="Breadcrumb" className="font-serif text-[1rem]">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {items.map((item, i) => (
                <Fragment key={`${item.label}-${i}`}>
                    {i > 0 && <li aria-hidden className="opacity-50">›</li>}
                    <li>
                        {item.to && i < items.length - 1 ? (
                            <Link to={item.to as any} params={item.params as any} search={item.search as any} className="underline">
                                {item.label}
                            </Link>
                        ) : (
                            <span aria-current="page">{item.label}</span>
                        )}
                    </li>
                </Fragment>
            ))}
        </ol>
    </nav>
);

export default Breadcrumb;

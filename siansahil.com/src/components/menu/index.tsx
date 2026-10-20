import MenuItem, {MenuItemProps} from "@/components/menuItem/index.tsx";
import Typography from "@/components/typography";
import {Link} from "@tanstack/react-router";
import {lazy, useEffect, useState} from "react";
import SocialRow from "@/components/socialRow";
interface MenuProps {
    title: string;
    menuItems?: MenuItemProps[]
    backgroundColor?: string;
}

const loadMenu = () =>
    import("@/components/menu/mobileMenu.tsx").then((module) => ({ default: module.MobileMenu}))

const MobileMenu = lazy(loadMenu)
const Menu = ({title, menuItems, backgroundColor="#ffffff"}:MenuProps) => {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 0)
        handleScroll()
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    if (!menuItems) return null

    return (
        <header
            style={{backgroundColor: scrolled ? backgroundColor : "transparent"}}
            className={"fixed z-40 top-0 left-0 w-full flex items-center justify-between gap-10 px-6 lg:px-22 py-2 transition-colors duration-300"}>
            <nav className={'flex gap-10 w-full'}>
                <Link to={"/"}>
                    <Typography level={"3"} value={title}></Typography>
                </Link>
                <div className={"hidden lg:flex items-center"}>
                    <div className={" flex items-center flex-1 gap-4 mb-2"}>
                        {menuItems?.map((item) => {
                            return <MenuItem
                                key={item.id}
                                {...item}
                            ></MenuItem>
                        })}
                    </div>
                </div>
                <div>
                    <SocialRow></SocialRow>
                </div>
            </nav>
            {/*<div>*/}
            {/*    <RouterButton button={}></RouterButton>*/}
            {/*</div>*/}

            <MobileMenu menuItems={menuItems}>

            </MobileMenu>
        </header>
    )
}

export default Menu
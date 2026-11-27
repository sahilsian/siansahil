'use client'
import {MenuIcon, XIcon} from "lucide-react";
import {useMobileMenu} from "@/hooks/useMobileMenu.ts";
import MenuItem, {MenuItemProps} from "@/components/menuItem";
import {useEffect} from "react";
import {useLocation} from "@tanstack/react-router";

interface MobileMenuProps {
    menuItems?: MenuItemProps[]
}


export const MobileMenu = ({menuItems}:MobileMenuProps) => {
    const { isMobileMenu, toggleMobileMenu } = useMobileMenu();
    const location = useLocation();

    useEffect(() => {
        if (isMobileMenu) {
            toggleMobileMenu()
        }
    }, [location])

    return (
        <div className={''}>
            <div className={"absolute top-[10px] right-[20px] z-20 lg:hidden flex hover:cursor-pointer "}>
                <div onClick={toggleMobileMenu} style={ isMobileMenu ? { display: 'flex' } : {  display: 'none'} }>
                    <XIcon />
                </div>
                <div onClick={toggleMobileMenu} style={ !isMobileMenu ? { display: 'flex' } : {  display: 'none'} }>
                    <MenuIcon />
                </div>
            </div>

            <div style={ isMobileMenu ? { display: 'flex' } : {  display: 'none'} } className={'flex absolute w-full top-0 right-0 h-screen'}>
                <div onClick={toggleMobileMenu} className={" flex-2 z-10 bg-[#00000050] w-full top-0 right-0 h-screen"}>
                </div>
                <div className={" py-8 px-5 flex-2 bg-[var(--color-menu)] text-[var(--color-nav)] w-full h-full top-0"}>
                    <nav>

                        {menuItems?.map((item) => {
                            return <div className={'py-2'}>
                                <MenuItem lg
                                key={item.id}
                                {...item}
                            ></MenuItem>
                            </div>
                        })}
                    </nav>
                </div>
            </div>
        </div>
    )
}


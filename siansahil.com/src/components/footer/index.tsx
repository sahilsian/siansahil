import MenuItem, {MenuItemProps} from "@/components/menuItem";
import Screen from "@/components/screen"
import Typography from "@/components/typography";
import Mailing from "@/components/mailing";
interface FooterProps {
    backgroundColor?: string,
    menuItems?: MenuItemProps[],
    title: string,
    description: string
}

interface CategoryGroup {
    category: string;
    items: MenuItemProps[];
}

const Footer = ( {backgroundColor, menuItems, title, description}:FooterProps) => {

    if (!menuItems) return null

    const sortByCategory = (accumulator:CategoryGroup[], currentValue:MenuItemProps ) => {
        // Destructure category
        const { category } = currentValue;
        let group = accumulator.find((group) => group.category == category)
        if(!group) {
            group = { category, items: [currentValue] };
            accumulator.push(group)
        } else {
            group.items.push(currentValue)
        }
        return accumulator;
    }

    const groupedMenu = menuItems.reduce<CategoryGroup[]>(sortByCategory, [])

    return (
        <Screen backgroundColor={backgroundColor}>
            <div className={"w-full"}>
                <div className={""}>
                    <Mailing></Mailing>
                </div>

                <footer className={"flex  px-6 lg:px-22 py-12 gap-20 flex-wrap"}>
                    <div className={"flex-1 min-w-[300px] "}>
                        <Typography level={"2"} value={title}></Typography>
                        <Typography level={"p"} value={description}></Typography>
                    </div>

                    <div className={"w-full flex-2 flex gap-10 justify-between flex-wrap"}>
                        {groupedMenu.map((group) => {
                            return (
                                <div key={group.category} className={"min-w-[300px] lg:min-w-[0px]"}>
                                    <Typography level={"3"} value={group.category}></Typography>
                                    {group.items.map((item) => {
                                        return <div key={item.id} className={"mb-2"}>
                                            <MenuItem {...item}></MenuItem>
                                        </div>
                                    })}
                                </div>
                            )
                        })}
                    </div>
                </footer>
            </div>
        </Screen>

    )
}

export default Footer
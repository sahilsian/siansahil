'use client'
import {PropsWithChildren} from "react";
import Typography from "@/components/typography";
import {useNavigate} from "@tanstack/react-router";
import SearchInput from "@/components/searchInput";
import {ControlInterface, Views} from "@/hooks/useControl.ts";
import CategoryInput from "@/components/categoryInput";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";
import CustomizeViewport from "@/components/customizeViewport";
import {useSite} from "@/contexts/site/siteContext.tsx";

interface ControlProps extends PropsWithChildren {
    controlMachine: ControlInterface
    categories: CollectionCategory[]
    currentCollection: string
}
export const Control = ({ controlMachine, children, categories, currentCollection}:ControlProps) => {
    const { messages } = useSite()
    const navigate = useNavigate()


    const categoryOptions = categories.map((category) => {
        return { name: category.category.name, label: category.layoutTitle }
    })

    // State Updates
    const handleSearchChange = async (e:any) => {
        controlMachine.pushSearch(e.target.value)

        // Removed due to UX Concerns
        // if(e.target.value === "") {
        //     await navigate({
        //         to: ".",
        //         search: (prev:any) => ({
        //             ...prev,
        //             title: ""
        //         })
        //     })
        // }
    }
    const handleClear = async () => {
        controlMachine.clearSearch();
        await navigate({
            to: ".",
            search: (prev:any) => ({
                ...prev,
                title: ""
            })
        })

    }

    // State Commits
    const handleSearch = async () => {
        controlMachine.commitSearch();
        await navigate({
            to: ".",
            search: (prev:any) => ({
                ...prev,
                // reset page
                page: 1,
                title: controlMachine.state.search
            })
        })
    }
    const handleCategoryChange = async(e:any) => {
        const newCategory = e.target.value
        controlMachine.pushCategory(newCategory)
        await navigate({
            to: ".",
            search: (prev:any) => ({
                ...prev,
                // reset page
                page: 1,
                collection: newCategory
            })
        })
    }

    const handleChangeView = async(view:Views) => {
        controlMachine.changeView(view)
        await navigate({
            to: ".",
            search: (prev:any) => ({
                ...prev,
                view: view
            })
        })
    }

    return (
        <div className={'relative z-10 '}>
            {/* One row: search on the left, dropdown + view buttons on the right.
                Never wraps; on narrow screens the search box shrinks to make room. */}
            <div className={'flex flex-nowrap items-center justify-between gap-3 mb-2'}>
                <div className={'flex items-center flex-1 min-w-0'}>
                    <div className={'min-w-0'}>
                        <SearchInput
                            onEnter={async(e) => {
                                if(e.key === "Enter") await handleSearch()
                            }}
                            disabled={controlMachine.isProcessing}
                            showClear={!!controlMachine.state.search}
                            onClear={handleClear}
                            onSearch={handleSearch}
                            handleChange={(e:any) => handleSearchChange(e)}
                            value={controlMachine.state.search || ''}
                        ></SearchInput>
                    </div>
                </div>

                <div className={'flex items-center flex-row-reverse shrink-0 gap-3 lg:gap-8'}>
                    <div>
                        <CustomizeViewport
                            controlMachine={controlMachine}
                            onClick={(view:Views) => handleChangeView(view)}
                        >

                        </CustomizeViewport>
                    </div>

                    <div>
                        <CategoryInput
                            value={currentCollection}
                            handleChange={(e:any) => handleCategoryChange(e)}
                            disabled={controlMachine.isProcessing}
                            options={categoryOptions}
                        >
                        </CategoryInput>
                    </div>
                </div>
            </div>

            {controlMachine.state.mode != "ERR" ?
                <div className={'py-4'}>
                    {children}
                </div>
                :
                <div>
                    <Typography level={"6"} value={messages.collectionError}></Typography>
                </div>
            }
        </div>
    )
}
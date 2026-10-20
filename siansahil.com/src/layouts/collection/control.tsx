'use client'
import {PropsWithChildren} from "react";
import Typography from "@/components/typography";
import Pagination from "@/components/pagination";
import {useNavigate, useSearch} from "@tanstack/react-router";
import {STANDARD_PAGINATION} from "@/lib/content";
import SearchInput from "@/components/searchInput";
import {ControlInterface, Views} from "@/hooks/useControl.ts";
import CategoryInput from "@/components/categoryInput";
import {CollectionCategory} from "@/components/renderers/collectionRenderer";
import CustomizeViewport from "@/components/customizeViewport";

interface ControlProps extends PropsWithChildren {
    controlMachine: ControlInterface
    pageCount?: number,
    total?: number;
    categories: CollectionCategory[]
}
export const Control = ({ controlMachine, pageCount, total=0, children, categories}:ControlProps) => {
    const search = useSearch({ strict: false });
    const navigate = useNavigate()

    const currentPage = search.page || STANDARD_PAGINATION.pagination.page;
    const currentPageSize = search.pageSize || STANDARD_PAGINATION.pagination.pageSize;

    const categoryOptions = categories.map((category) => {
        return { name: category.category.name }
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
                category: newCategory
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
            <div className={'sm:flex sm:justify-between mb-2'}>
                <div className={'flex sm:justify-start justify-between gap-8 sm:items-center'}>
                    <div>
                        <Pagination page={currentPage} pageCount={pageCount} pageSize={currentPageSize} total={total}></Pagination>
                    </div>
                    <div>
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

                <div className={'flex w-full items-center flex-row-reverse justify-start gap-4 lg:gap-8'}>
                    <div>
                        <CustomizeViewport
                            controlMachine={controlMachine}
                            onClick={(view:Views) => handleChangeView(view)}
                        >

                        </CustomizeViewport>
                    </div>

                    <div className={"max-w-[100px] "}>
                        <CategoryInput
                            value={controlMachine.state.category || ''}
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
                    <Typography level={"6"} value={"An error has occured. Please forms me with a screenshot!"}></Typography>
                </div>
            }

            <div>
                <Pagination page={currentPage} pageCount={pageCount} pageSize={currentPageSize} total={total}></Pagination>
            </div>
        </div>
    )
}
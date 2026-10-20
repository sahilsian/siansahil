import {useReducer} from "react";
import {STANDARD_PAGINATION} from "@/lib/content";
import {useSearch} from "@tanstack/react-router";

// (Q, Σ, δ, q₀, F)
// Q = Finite States that Exist
// Σ = Actions
// δ = Transition
// q₀ = Initial State

// Q States that exist
export interface PaginationProps {
    page: number,
    pageSize: number
}

export type Views = 'post' | 'list'
export const VIEWS = ['post', 'list'] as const

interface State {
    mode: 'IDLE' | 'LOADING' | 'ERR',
    pagination: PaginationProps,
    search?: string,
    category?: string
    filters: Record<string,any>
    view: Views
}

// Σ Actions
export enum ACTIONS_LIST {

    COMMIT_SEARCH = "COMMIT_SEARCH",
    PUSH_SEARCH = "PUSH_SEARCH",
    CLEAR_SEARCH = "CLEAR_SEARCH",

    PUSH_CATEGORY = "PUSH_CATEGORY",
    CLEAR_CATEGORY = "CLEAR_CATEGORY",

    CHANGE_VIEW = "CHANGE_VIEW",

    SET_SUCCESS = "SET_SUCCESS",
    SET_ERROR = "SET_ERROR",
    SET_LOADING = "SET_LOADING"
}

type Action_CommitSearch = {
    type: ACTIONS_LIST.COMMIT_SEARCH;
}

type Action_PushSearch = {
    type: ACTIONS_LIST.PUSH_SEARCH;
    cargo: string
}

type Action_ClearSearch = {
    type: ACTIONS_LIST.CLEAR_SEARCH
}

type Action_PushCategory = {
    type: ACTIONS_LIST.PUSH_CATEGORY
    cargo: string
}

type Action_ClearCategory = {
    type: ACTIONS_LIST.CLEAR_CATEGORY
}

type Action_ChangeView = {
    type: ACTIONS_LIST.CHANGE_VIEW
    cargo: Views
}

type Action_SetSuccess = {
    type: ACTIONS_LIST.SET_SUCCESS
}

type Action_SetError = {
    type: ACTIONS_LIST.SET_ERROR
}

type Action_SetLoading = {
    type: ACTIONS_LIST.SET_LOADING
}

type Action = Action_CommitSearch |
    Action_PushSearch |
    Action_ClearSearch |
    Action_PushCategory |
    Action_ClearCategory |
    Action_ChangeView |
    Action_SetSuccess |
    Action_SetError |
    Action_SetLoading

// δ Transition Function Map
const transitionFunc = (state:State, action:Action): State => {
    switch (action.type) {
        case ACTIONS_LIST.COMMIT_SEARCH:
            return {
                ...state,
                mode: "LOADING",
            }
        case ACTIONS_LIST.PUSH_SEARCH:
            return {
                ...state,
                mode: "IDLE",
                search: action.cargo
            }

        case ACTIONS_LIST.CLEAR_SEARCH:
            return {
                ...state,
                mode: "IDLE",
                search: ""
            }
        case ACTIONS_LIST.PUSH_CATEGORY:
            return {
                ...state,
                mode: "IDLE",
                category: action.cargo
            }
        case ACTIONS_LIST.CLEAR_CATEGORY:
            return {
                ...state,
                mode: "IDLE",
                category: "all"
            }

        case ACTIONS_LIST.CHANGE_VIEW:
            return {
                ...state,
                mode: "LOADING",
                view: action.cargo
            }

        case ACTIONS_LIST.SET_LOADING:
            return {
                ...state,
                mode: 'LOADING'
            }
        case ACTIONS_LIST.SET_ERROR:
            return {
                ...state,
                mode: "ERR"
            }
        case ACTIONS_LIST.SET_SUCCESS:
            return {
                ...state,
                mode: "IDLE"
            }
        default: {
            return state
        }
    }
}

// q₀ Initial State for State Machine
const initState:State = {
    mode: 'IDLE',
    pagination: {
        page: STANDARD_PAGINATION.pagination.page,
        pageSize: STANDARD_PAGINATION.pagination.pageSize
    },
    search: "",
    category: "all",
    view: "post",
    filters: {}
}

export interface ControlInterface {
    state:State
    isProcessing: boolean
    // Pushes and clears query
    commitSearch: () => void
    // Saves query to state
    pushSearch: (search:string) => void
    pushCategory: (category:string) => void
    // Clears search state
    clearSearch: () => void
    clearCategory: () => void
    // Changes View
    changeView: (view:Views) => void
    // Flag
    setSuccess: () => void
    setLoading: () => void
    setError: () => void
}

export const useControl = ():ControlInterface => {
    const search = useSearch({ strict: false });

    const [state, dispatch] = useReducer(transitionFunc, {
        ...initState,
        search: search.title || "",
        category: search.category || "all"
    })

    const isProcessing = state.mode === "LOADING";


    return {
        state,
        isProcessing,
        // Search Transitions
        commitSearch: () => dispatch({type: ACTIONS_LIST.COMMIT_SEARCH}),
        pushSearch: (query:string) => dispatch({type: ACTIONS_LIST.PUSH_SEARCH, cargo: query}),
        clearSearch: () => dispatch({type: ACTIONS_LIST.CLEAR_SEARCH}),

        // Category Transitions
        pushCategory: (query:string) => dispatch({type: ACTIONS_LIST.PUSH_CATEGORY, cargo: query}),
        clearCategory: () => dispatch({type: ACTIONS_LIST.CLEAR_CATEGORY}),

        // View Transitions
        changeView: (query:Views) => dispatch({type: ACTIONS_LIST.CHANGE_VIEW, cargo: query}),

        // "Flag" Transitions
        setSuccess: () => dispatch({type: ACTIONS_LIST.SET_SUCCESS}),
        setLoading: () => dispatch({type: ACTIONS_LIST.SET_LOADING}),
        setError: () => dispatch({type: ACTIONS_LIST.SET_ERROR})
    }
}
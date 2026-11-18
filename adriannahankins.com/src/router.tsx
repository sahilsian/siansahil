import { createRouter } from '@tanstack/react-router'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
// Import the generated route tree
import { routeTree } from './routeTree.gen'
import React from "react";
import FourOFour from "@/layouts/404";

// Create a new router instance
export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
        routeTree,
        scrollRestoration: true,
        context: { ...rqContext },
        defaultPreload: 'intent',
        defaultNotFoundComponent: () => {
            return (
                <FourOFour></FourOFour>
            )
        },
        Wrap: (props: { children: React.ReactNode }) => {
        return (
            <TanstackQuery.Provider {...rqContext}>
             {props.children}
            </TanstackQuery.Provider>
            )
        },
  })

  return router
}

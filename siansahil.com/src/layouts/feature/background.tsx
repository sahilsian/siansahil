interface BackgroundProps {
    variation: string
}

export const Background = ({variation}:BackgroundProps) => {
    if(variation === "flex-row") return (
        <div className={"absolute z-[10] sm:block md:hidden xl:block  w-full h-full"}>
            <div
                className="absolute bg-[var(--color-margin-red)] w-[1px] h-[110%] top-0 left-[22px] md:left-31/56"
                style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskSize: '100% 100%',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                    maskRepeat: 'no-repeat',
                    maskSize: '100% 100%',
                }}
            ></div>
            {/*<div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%] w-[100%] h-[1px] bottom-17/50 md:bottom-29/50"}></div>*/}
            {/*<div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%] w-[100%] h-[1px] bottom-22/77 md:bottom-26/50"}></div>*/}
        </div>
    )
    if(variation === "flex-row-reverse") return (
        <div className={"absolute z-[10] sm:block md:hidden xl:block  w-full h-full "}>
            <div className={"MarginLine relative bg-[var(--color-margin-red)] opacity-[46%] w-[1px] h-[120%] top-[-50px] md:top-[-100px] left-[22px] md:left-[90px]"}
                 style={{
                     WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                     WebkitMaskRepeat: 'no-repeat',
                     WebkitMaskSize: '100% 100%',
                     maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                     maskRepeat: 'no-repeat',
                     maskSize: '100% 100%',
                 }}
            ></div>
            {/*<div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%] w-[100%] h-[1px] bottom-17/50 md:bottom-29/50"}></div>*/}
            {/*<div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%] w-[100%] h-[1px] bottom-22/77 md:bottom-26/50"}></div>*/}
        </div>
    )
    return (
        <></>
    )
}
export const Background = () => {
    return (
        <div className={"absolute left-0 z-[0] w-full h-full "}>
            <div className={"MarginLine relative bg-[var(--color-margin-red)] opacity-[46%] w-[1px] h-[calc(100%+50px)] top-[-50px] left-[25px] lg:left-[86px]"}
                 style={{
                     WebkitMaskImage:
                         "linear-gradient(to bottom, black 0%, black 80%, rgba(0,0,0,0) 100%)",
                     WebkitMaskRepeat: "no-repeat",
                     WebkitMaskSize: "100% 100%",
                     maskImage:
                         "linear-gradient(to bottom, black 0%, black 80%, rgba(0,0,0,0) 100%)",
                     maskRepeat: "no-repeat",
                     maskSize: "100% 100%",
                 }}
            ></div>
            <div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%] w-[100%] h-[1px] top-[122px]  lg:top-[134px]"}></div>
            <div className={"MarginLine absolute bg-[var(--color-margin-blue)] opacity-[46%]  w-[100%] h-[1px] top-[162px] sm:top-[168px] lg:top-[184px] "}></div>
        </div>
    )
}

export default Background
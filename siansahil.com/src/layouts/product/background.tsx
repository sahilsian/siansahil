export const Background = () => {
    return (
        <div className={"absolute left-0 z-[0] w-full h-full "}>
            <div className={"MarginLine relative bg-[var(--color-margin-red)] opacity-[46%] w-[1px] h-[100%] left-[21px] sm:hidden md:hidden lg:block lg:left-[86px]"}
                 style={{
                     WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                     WebkitMaskRepeat: 'no-repeat',
                     WebkitMaskSize: '100% 100%',
                     maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), black 20%, black 80%, rgba(0,0,0,0))',
                     maskRepeat: 'no-repeat',
                     maskSize: '100% 100%',
                 }}
            ></div>
        </div>
    )
}

export default Background
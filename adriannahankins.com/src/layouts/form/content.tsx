import Typography from "@/components/typography";
import {useEffect, useState} from "react";

interface ContentProps {
    title: string
    description: string
}

export const Content = ({title, description}:ContentProps) => {
    const [isPageLoaded, setIsPageLoaded] = useState(false);
    const [animationComplete, setAnimationComplete] = useState(false);

    useEffect(() => {
        if (document.readyState === 'complete') {
            setIsPageLoaded(true);
        } else {
            const handleLoad = () => setIsPageLoaded(true);
            window.addEventListener('load', handleLoad);
            return () => window.removeEventListener('load', handleLoad);
        }
    }, []);

    useEffect(() => {
        if (!isPageLoaded) return;

        setAnimationComplete(false);

        const startTimer = setTimeout(() => {
            const completeTimer = setTimeout(() => {
                setAnimationComplete(true);
            }, 1500);

            return () => clearTimeout(completeTimer);
        }, 50);

        return () => clearTimeout(startTimer);
    }, [isPageLoaded]);

    return (
        <div className={`py-22 pb-6`}>
            <div className={'flex items-center gap-3'}>
                <div
                    className={`typewriter-title ${isPageLoaded ? 'animate' : ''}`}
                >
                    <Typography level={"2"} value={title}></Typography>
                </div>

                {/*{controlMachine.state.mode == 'LOADING' &&*/}
                {/*    <div className="flex items-center justify-center mb-5">*/}
                {/*        <div*/}
                {/*            className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent"*/}
                {/*        ></div>*/}
                {/*    </div>*/}
                {/*}*/}
            </div>
            <div
                className={`typewriter-description ${isPageLoaded ? 'animate' : ''} ${animationComplete ? 'complete' : ''}`}
            >
                <Typography level={"p"} value={description}></Typography>
            </div>
        </div>
    )
}


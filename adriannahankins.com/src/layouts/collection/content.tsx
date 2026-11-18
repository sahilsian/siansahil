import Typography from "@/components/typography";
import {ControlInterface} from "@/hooks/useControl.ts";
import {useEffect, useState} from "react";
import Spinner from "@/components/spinner";

interface ContentProps {
    title?: string;
    description?: string;
    controlMachine: ControlInterface,
    categoryKey: string
}

export const Content = ({controlMachine, title, description, categoryKey}:ContentProps) => {
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
    }, [categoryKey, isPageLoaded]);

    return (
        <div className={`py-22 pb-6`}>
            <div className={'flex items-center gap-3'}>
                <div
                    key={`title-${categoryKey}-${title}`}
                    className={`typewriter-title ${isPageLoaded ? 'animate' : ''}`}
                >
                    <Typography level={"2"} value={title}></Typography>
                </div>


                {controlMachine.state.mode == 'LOADING' && <Spinner></Spinner>}
            </div>
            <div
                key={`desc-${categoryKey}-${description}`}
                className={`typewriter-description ${isPageLoaded ? 'animate' : ''} ${animationComplete ? 'complete' : ''}`}
            >
                <Typography level={"p"} value={description}></Typography>
            </div>
        </div>
    )
}
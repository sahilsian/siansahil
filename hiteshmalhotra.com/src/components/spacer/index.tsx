interface  SpacerProps {
    height: string;
}
const Spacer = ({height= "10px"}:SpacerProps) => {
    return (
        <div style={{height: height}}></div>
    )
}

export default Spacer
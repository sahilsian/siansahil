const Spinner = () => {
    return (
        <div className="flex items-center justify-center mb-5">
            <div
                className={`h-8 w-8 animate-spin rounded-full border-gray-500 border-1 border-t-transparent`}
            ></div>
        </div>
    )
}

export default Spinner
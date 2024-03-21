export default function InputError({ content }) {
    return (
        <>
            {content && <div className="text-[12px] text-red-500">{content}</div>}
        </>
    )
}
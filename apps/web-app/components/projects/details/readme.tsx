// import { useMdViewer } from "apps/web-app/hooks/shared/use-md-viewer";
import ReactMarkdown from 'react-markdown'
// import MarkdownPreview from "@uiw/react-markdown-preview";
export default function AdditionalDetails() {
    const fileContent = "| Plugin | README |"
    // const { response } = useMdViewer();
    const source = `- Type some Markdown on the left\n
    > The overriding design goal for Markdown's\n
    Dillinger requires [Node.js](https://nodejs.org/) v10+ to run.`;
    return (
        <>
            <div className="flex justify-between">
                <div className="text-[14px] font-medium text-[#64748B] tracking-[1px]">
                    Additional Details
                </div>
                <div className="text-[#156FF7] text-[13px] font-medium cursor-pointer">
                    Edit
                </div>
            </div>
            <h1>TEST</h1>
            <h2>dsh</h2>
            {/* <div dangerouslySetInnerHTML={{ __html: response  }} /> */}
            <h1>TEST</h1>
                <div className='no-tailwind'>
                    <ReactMarkdown>{source}</ReactMarkdown>
                </div>
            {/* <MarkdownPreview source={source} /> */}


        </>
    )
}
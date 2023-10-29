// import { useMdViewer } from "apps/web-app/hooks/shared/use-md-viewer";
// import ReactMarkdown from 'react-markdown'

import { useMdViewer } from "apps/web-app/hooks/shared/use-md-viewer";
// import md from 'markdown-it';


// import MarkdownPreview from "@uiw/react-markdown-preview";
export default function AdditionalDetails() {
    const { response } = useMdViewer();

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
            <div className='no-tailwind'>
                <div dangerouslySetInnerHTML={{ __html: response }} />
                {/* <ReactMarkdown>{response}</ReactMarkdown> */}
            </div>
            {/* <MarkdownPreview source={source} /> */}


        </>
    )
}
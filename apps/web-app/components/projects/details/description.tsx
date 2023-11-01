import { useState } from "react";

export default function Description({content}) {
    const [collapsed, setCollapsed] = useState(true);

    const toggleContent = () => {
        setCollapsed(!collapsed);
    };
    return (
        <div className="flex flex-col gap-[8px]">
            <div className="text-[14px] font-medium text-[#64748B] tracking-[1px]">Description</div>
            <div className="text-[15px]">
                <p
                    className={`overflow-hidden transition-all duration-200 pt-2 ${collapsed ? `read-less` : 'max-h-full'
                        }`}
                >
                    <span className="text-[15px] leading-[20px] ">{content}</span>
                </p>
                {content && content.length > 350 && (
                    <div className="flex flex-row-reverse">
                        <button
                        className="block mt-1 text-blue-500 hover:underline right-0 relative"
                        onClick={toggleContent}
                    >
                        <span className="text-[12px] leading-[20px] font-semibold text-blue-500">{collapsed ? 'Show More' : 'Show Less'}</span>
                    </button>
                    </div>
                )}
                
            </div>
        </div>
    );
}
import Image from "next/image";

export default function ContactInfos({ project }) {
    return (
        <>
            {
                project && project.contactEmail &&
                (
                    <div className="flex flex-col gap-[10px] bg-white rounded-[12px] p-[16px]">
                        <div className="text-[18px] font-semibold leading-[28px] pb-[14px] border-b border-[#E2E8F0]">
                            Contact Info
                        </div>
                        <div>
                            <div className="flex gap-1 pl-[7px] py-[4px] bg-[#F1F5F9]">
                                <div><Image src="/assets/images/icons/projects/email.svg" alt="project image" width={16} height={16} /></div>
                                <div className="text-[#156FF7] text-[13px] font-medium truncate max-w-[215px]" title={project.contactEmail}>{project.contactEmail}</div>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
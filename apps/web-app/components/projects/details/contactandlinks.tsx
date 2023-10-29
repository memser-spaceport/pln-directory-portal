import Image from "next/image";

export default function ContactAndLinks() {
    return (
        <>
            <div className="flex gap-[32px]">
                <div className="flex flex-col gap-[8px]">
                    <div className="text-[#64748B] text-[14px] font-medium tracking-[1px]">Contact</div>
                    <div className="flex gap-2">
                        <div><Image src="/assets/images/icons/projects/email.svg" alt="project image" width={16} height={16} /></div>
                        <div className="text-[#156FF7] text-[13px] font-medium">connectdata@ymail.com</div>
                    </div>
                </div>
                <div className="flex flex-col gap-[8px]">
                    <div className="text-[#64748B] text-[14px] font-medium tracking-[1px]">Links</div>
                    <div>
                        <div className="flex gap-2">
                            <div><Image src="/assets/images/icons/projects/link.svg" alt="project image" width={16} height={16} /></div>
                            <div className="text-[#156FF7] text-[13px] font-medium">Link text </div>
                            <div className="relative top-[-2px]"><Image src="/assets/images/icons/projects/arrow.svg" alt="project image" width={10} height={10} /></div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
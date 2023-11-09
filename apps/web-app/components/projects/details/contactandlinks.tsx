import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import Image from "next/image";

export default function ContactAndLinks({ project }) {
    const analytics = useAppAnalytics();
    return (
        <>
            <div className="flex gap-[32px]">
                {/* <div className="flex flex-col gap-[8px]">
                    <div className="text-[#64748B] text-[14px] font-medium tracking-[1px]">Contact</div>
                    <div className="flex gap-2">
                        <div><Image src="/assets/images/icons/projects/email.svg" alt="project image" width={16} height={16} /></div>
                        <div className="text-[#156FF7] text-[13px] font-medium">{project.contactEmail}</div>
                    </div>
                </div> */}
                {
                    project.projectLinks?.length > 0 && <div className="flex flex-col gap-[8px]">
                        <div className="text-[#475569] text-[14px] font-semibold tracking-[1px]">Links</div>
                        <div className="flex gap-2 cursor-pointer">
                        {
                            project.projectLinks.map((link, index) => {
                                return (
                                    <div key={index}>
                                        <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={()=>{
                                            analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_LINKS_CLICKED, {
                                                linkURL: link.url,
                                            });
                                        }}>
                                            <div className="flex gap-2">
                                                <div><Image src="/assets/images/icons/projects/link.svg" alt="project image" width={16} height={16} /></div>
                                                <div className="text-[#156FF7] text-[13px] font-medium">{link.text} </div>
                                                <div className="relative top-[-2px]"><Image src="/assets/images/icons/projects/arrow.svg" alt="project image" width={10} height={10} /></div>
                                            </div>
                                        </a>
                                    </div>
                                );
                            })
                        }
                        </div>
                    </div>
                }

            </div>
        </>
    );
}
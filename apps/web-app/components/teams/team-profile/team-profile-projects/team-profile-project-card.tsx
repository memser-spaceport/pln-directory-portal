import Image from "next/image";
import { useRouter } from "next/router";

export default function TeamProfileProjectCard({ project, hasProjectsEditAccess = false }) {
    const router = useRouter();

   
    return (
        <div className="py-[16px] pl-[16px] pr-[32px] flex hover:bg-[#F8FAFC] justify-between"
            >
            <div className="flex ">
                <div className="relative w-[41px] h-[41px]"><Image src={project.image} alt="project image" width={41} height={41} className="rounded"/></div>
                <div className="pl-4">
                    <div className="text-[14px] font-semibold flex">
                        <div>{project.name}</div>
                        {
                            project.fundingNeeded &&
                            <div className="flex mx-1 px-[8px] text-[#D87705] text-[12px] bg-[#FFEAC1] rounded-[24px]">
                                <Image src={'/assets/images/icons/projects/funding.svg'} alt="project image" width={12} height={12} />
                                <div className="px-1">Raising Funds</div>
                            </div>
                        }
                    </div>
                    <div className="text-[12px]">{project.tagline}</div>
                </div>
            </div>
            <div className="my-auto gap-2 flex">
                {/* Edit and pin */}
                {
                    hasProjectsEditAccess
                    &&
                    <div 
                    className="cursor-pointer"
                    onClick={() => { router.push(`/directory/projects/edit/${project.id}`) }}
                    >
                        <Image src='/assets/images/icons/projects/edit-project.svg' alt="project image" width={24} height={24} />
                    </div> 
                }
                <div
                    onClick={() => { router.push(`/directory/projects/${project.id}`) }}
                    className="cursor-pointer"
                >
                    <Image src='/assets/images/icons/projects/more-details.svg' alt="project image" width={16} height={16} />
                </div>
            </div>
        </div>
    )
}
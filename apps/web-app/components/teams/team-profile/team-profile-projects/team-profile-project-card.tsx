import Image from "next/image";
import { useRouter } from "next/router";

export default function TeamProfileProjectCard({ project }) {
    const router = useRouter();
    return (
        <div className="py-[16px] pl-[16px] pr-[32px] flex cursor-pointer hover:bg-[#F8FAFC] justify-between"
            onClick={() => { router.push(`/directory/projects/${project.id}`) }}>
            <div className="flex ">
                <Image src={project.image} alt="project image" width={41} height={41} />
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
                    <div className="text-[12px]">{project.description}</div>
                </div>
            </div>
            <div className="my-auto">
                {/* Edit and pin */}
                <Image src='/assets/images/icons/projects/more-details.svg' alt="project image" width={16} height={16} />
            </div>
        </div>
    )
}
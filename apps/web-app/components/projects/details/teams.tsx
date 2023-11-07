import Image from "next/image";

export default function TeamsInvolved({ project }) {
    return (
        <>
            {
                project
                &&
                <div className="flex flex-col gap-[10px] bg-white rounded-[12px] p-[16px]">
                    <div className="text-[18px] font-semibold leading-[28px] pb-[14px] border-b border-[#E2E8F0]">
                        Teams
                    </div>
                    <div className="text-[16px] text-[#64748B] flex gap-[10px]">
                        <div><Image src={project.image} alt="project image" width={40} height={40} className="rounded" /></div>
                        <div className="m-2">{project.maintainingTeam.name}</div>
                    </div>
                    {
                        project.contributingTeams
                        && project.contributingTeams.length
                        &&
                        project.contributingTeams.map((cteam, index) => {
                            return (
                                <div className="text-[16px] text-[#64748B] flex gap-[10px]" key={'cteam'+index}>
                                    <div><Image src={cteam.logo} alt="project image" width={40} height={40} className="rounded" /></div>
                                    <div className="m-2">{cteam.label}</div>
                                </div>
                            );
                        })

                    }

                </div>
            }
        </>
    );
}
import { useRouter } from "next/router";
import TeamProfileProjectCard from "./team-profile-project-card";
import { useState } from "react";
import { TeamProfileProjectsModal } from "./team-profile-seeall-popop";

export default function TeamProfileProjects({ projects, userInfo, team }) {

    const [teamProjects, setTeamProjects] = useState(projects.slice(0, 3));
    const [seeAllPopup, setSeeAllPopup] = useState(false);

    const isTeamLead = ((userInfo?.roles?.length > 0 &&
        userInfo.roles.includes('DIRECTORYADMIN')) ||
        (userInfo?.leadingTeams?.length > 0 &&
            userInfo.leadingTeams.includes(team.id)));

    const seeAllAction = () => {
        // setTeamProjects(projects);
        setSeeAllPopup(true);
    }

    const router = useRouter();
    return (
        <>
            <h3 className="mb-2 mt-6 font-medium text-slate-500 flex justify-between">
                <div className="flex">
                    <div>Projects {projects.length > 0 && <span>({projects.length})</span>}</div>
                    {/* <div className="px-2 cursor-pointer" onClick={()=>{router.push('/directory/projects/add')}}>
                        <div className="px-[8px] py-[5px] rounded bg-[#156FF7] text-white text-[12px] font-semibold">+Add</div>
                    </div> */}
                </div>


                {
                    projects.length > 0 && <div className="text-[13px] text-[#156FF7] cursor-pointer flex gap-[12px]">
                        {
                            isTeamLead && <div className=" cursor-pointer" onClick={() => { router.push('/directory/projects/add?teamUid='+team.id) }}>
                                Add Project
                            </div>
                        }
                        {
                            projects.length > 3 && <div className=" cursor-pointer" onClick={seeAllAction}>
                                See All
                            </div>
                        }


                    </div>
                }
            </h3>

            {
                projects.length === 0 && isTeamLead && <div className="p-[16px] max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                    You have not added any projects. <span className="text-[#156FF7] cursor-pointer" onClick={() => { router.push('/directory/projects/add?teamUid='+team.id) }}>Click Here</span> to add a new project.
                </div>
            }
            {
                projects.length === 0 && !isTeamLead  && <div className="p-[16px] max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                No Projects added yet.
            </div>
            }

            

            <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                {
                    teamProjects.map(project => {
                        return project && <TeamProfileProjectCard key={project.id} project={project}/>
                    })
                }
            </div>
            <TeamProfileProjectsModal
                isOpen={seeAllPopup}
                setIsModalOpen={setSeeAllPopup}
                projects={projects}
            />
        </>
    )
}
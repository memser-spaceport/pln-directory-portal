import TeamProfileProjectCard from "./team-profile-project-card";

export default function TeamProfileProjects({projects}) {
    return (
        <>
            <h3 className="mb-2 mt-6 font-medium text-slate-500 flex justify-between">
                <div className="flex">
                    <div>Projects ({projects.length})</div>
                    <div className="px-2 cursor-pointer">
                        <div className="px-[8px] py-[5px] rounded bg-[#156FF7] text-white text-[12px] font-semibold">+Add</div>
                    </div>
                </div>

                <div className="text-[13px] text-[#156FF7] cursor-pointer">See All</div>
            </h3>
            <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                {
                    projects.map(project=>{
                        return project && <TeamProfileProjectCard key={project.id} project={project}/>
                    })
                }
            </div>
        </>
    )
}
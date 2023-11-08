import Modal from "apps/web-app/components/layout/navbar/modal/modal";
import Image from "next/image";
import { useRouter } from "next/router";
import React from 'react';


export function AllTeamsModal({
    isOpen,
    setIsModalOpen,
    project,
}) {
    const router = useRouter();

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => setIsModalOpen(false)}
            enableFooter={false}
            enableHeader={false}
        >
            <div className="pt-8 slim-scroll">
                <div className="px-8 mb-4 font-bold text-slate-900">
                    {'Teams'} ({project.contributingTeams.length + 1})
                </div>
                <div className="px-8 rounded-xl github-project-popup overflow-y-auto">
                    <div className="text-[16px] text-[#64748B] flex gap-[10px] cursor-pointer hover:bg-slate-100"
                    onClick={() => { router.push('/directory/teams/' + project.maintainingTeam.uid  ) }}
                    >
                        <div><Image src={project.maintainingTeam?.logo?.url} alt="project image" width={40} height={40} className="rounded" /></div>
                        <div className="m-2">{project.maintainingTeam.name}</div>
                    </div>
                    {
                        project.contributingTeams
                        && project.contributingTeams.length > 0
                        &&
                        project.contributingTeams.map((cteam, index) => {
                            return (
                                <React.Fragment key={'cteam' + index}>
                                    {
                                        index < 3 &&
                                        <div className="text-[16px] text-[#64748B] flex gap-[10px] cursor-pointer hover:bg-slate-100"
                                         key={'cteam' + index}
                                         onClick={() => { router.push('/directory/teams/' + cteam.value  ) }}
                                         >
                                            <div><Image src={cteam.logo} alt="project image" width={40} height={40} className="rounded" /></div>
                                            <div className="m-2">{cteam.label}</div>
                                        </div>
                                    }
                                </React.Fragment>
                            );
                        })

                    }
                    {/* {project?.map((project, i) => {
            return (
                <>
                    HI
                </>
            );
          })} */}
                </div>
                <div className="p-4 border-t-2 w-full">
                    <div className="flex place-content-end  ">
                        <button
                            className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-[90px] w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8] disabled:bg-slate-400"
                            onClick={() => setIsModalOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

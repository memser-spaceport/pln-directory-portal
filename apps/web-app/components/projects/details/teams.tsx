import Image from "next/image";
import { AllTeamsModal } from "./all-teams";
import React, { useState } from "react";
import { useRouter } from "next/router";
import { ReactComponent as Core } from '/public/assets/images/icons/projects/core.svg';
import { UserGroupIcon } from "@heroicons/react/solid";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";

export default function TeamsInvolved({ project }) {
    const [seeAllPopup, setSeeAllPopup] = useState(false);
    const router = useRouter();
    const analytics = useAppAnalytics();

    const onMaintainerTeamClicked = (team) => {
        router.push('/teams/' + team.uid  );
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_MAINTAINER_TEAM_CLICKED, {
          teamUid: team.uid,
          teamName: team.name,
        });
      }

      const onContributingTeamClicked = (cteam) => {
        router.push('/teams/' + cteam.value );
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_CONTRIBUTING_TEAM_CLICKED, {
          teamUid: cteam.value,
          teamName: cteam.label,
        });
      }

    return (
        <>
            {
                project
                &&
                <div className="flex flex-col gap-[10px] bg-white rounded-[12px] p-[16px]">
                    <div className="leading-[28px] pb-[14px] border-b border-[#E2E8F0] flex justify-between">
                        <div className="text-[18px] font-semibold ">Teams</div>
                        {
                            project.contributingTeams.length > 3
                            &&
                            <div className="text-[12px] leading-[20px] font-semibold text-blue-500 pt-1 cursor-pointer"
                            onClick={()=>{
                                analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_SEEALL_CLICKED);
                                setSeeAllPopup(true);
                            }}
                            >See All</div>
                        }
                    </div>
                    <div className="text-[16px] text-[#64748B] flex cursor-pointer hover:bg-slate-100 justify-between"
                            onClick={() => { onMaintainerTeamClicked(project.maintainingTeam) }}
                    >
                            <div className="flex gap-[10px] ">
                                {
                                    !project.maintainingTeam?.logo
                                    && <UserGroupIcon className="bg-gray-200 fill-white inline inset-y-0 left-2 my-auto h-[40px] w-[40px] rounded mr-[4px]" />
                                }
                                {
                                    project.maintainingTeam?.logo
                                    && <div><Image src={project.maintainingTeam?.logo?.url} alt="project image" width={40} height={40} className="rounded" /></div>
                                }
                                <div className="m-2">{project.maintainingTeam.name}</div>
                            </div>
                            <div className="flex p-2" title="Maintainer"><Core /></div>
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
                                        <div className="text-[16px] text-[#64748B] flex gap-[10px] cursor-pointer hover:bg-slate-100 relative"
                                         key={'cteam' + index}
                                         onClick={() => { onContributingTeamClicked(cteam) }}
                                         >
                                            {
                                                cteam.logo && <div><Image src={cteam.logo} alt="project image" width={40} height={40} className="rounded" /></div>
                                            }
                                            {
                                                !cteam.logo && <UserGroupIcon className="bg-gray-200 fill-white inline inset-y-0 left-2 my-auto h-[40px] w-[40px] rounded mr-[4px]" />
                                            }
                                            <div className="m-2 max-w-[188px]">{cteam.label}</div>
                                        </div>
                                    }
                                </React.Fragment>
                            );
                        })

                    }
                    <AllTeamsModal
                        isOpen={seeAllPopup}
                        setIsModalOpen={setSeeAllPopup}
                        project={project}
                    />
                </div>
            }
        </>
    );
}
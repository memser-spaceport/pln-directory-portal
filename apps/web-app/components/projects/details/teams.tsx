import Image from 'next/image';
import { AllTeamsModal } from './all-teams';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { ReactComponent as Core } from '/public/assets/images/icons/projects/core.svg';
import { UserGroupIcon } from '@heroicons/react/solid';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

export default function TeamsInvolved({ project }) {
  const [seeAllPopup, setSeeAllPopup] = useState(false);
  const router = useRouter();
  const analytics = useAppAnalytics();

  const onMaintainerTeamClicked = (team) => {
    router.push('/teams/' + team.uid);
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.PROJECT_DETAIL_MAINTAINER_TEAM_CLICKED,
      {
        teamUid: team.uid,
        teamName: team.name,
      }
    );
  };

  const onContributingTeamClicked = (cteam) => {
    router.push('/teams/' + cteam.uid);
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.PROJECT_DETAIL_CONTRIBUTING_TEAM_CLICKED,
      {
        teamUid: cteam.uid,
        teamName: cteam.name,
      }
    );
  };

  return (
    <>
      {project && (
        <div className="flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px]">
          <div
            className="flex cursor-pointer justify-between border-b border-[#E2E8F0] pb-[14px] leading-[28px]  hover:text-[#156FF7]"
            onClick={() => {
              analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_DETAIL_SEEALL_CLICKED
              );
              setSeeAllPopup(true);
            }}
          >
            <div className="text-[18px] font-semibold">
              <div>Teams</div>
            </div>
            <div className="flex gap-3 ">
              <div className="text-xs font-medium not-italic leading-[14px] text-[color:var(--neutral-slate-600,#475569)]">
                <div className="relative top-[5px] rounded-[24px]  bg-[#F1F5F9] px-[8px] py-[2px] ">
                  {project.contributingTeams.length + 1}
                </div>
              </div>
              {/* {project.contributingTeams.length > 3 && (
                  <div
                    className="cursor-pointer pt-1 text-[12px] font-semibold leading-[20px] text-blue-500"
                    onClick={() => {
                      analytics.captureEvent(
                        APP_ANALYTICS_EVENTS.PROJECT_DETAIL_SEEALL_CLICKED
                      );
                      setSeeAllPopup(true);
                    }}
                  >
                    See All
                  </div>
                )} */}
            </div>
          </div>
          <div
            className="flex cursor-pointer justify-between text-[16px] text-[#64748B] hover:bg-slate-100"
            onClick={() => {
              onMaintainerTeamClicked(project.maintainingTeam);
            }}
          >
            <div className="flex gap-[10px] ">
              {!project.maintainingTeam?.logo && (
                <UserGroupIcon className="inset-y-0 left-2 my-auto mr-[4px] inline h-[40px] w-[40px] rounded bg-gray-200 fill-white" />
              )}
              {project.maintainingTeam?.logo && (
                <div>
                  <Image
                    src={project.maintainingTeam?.logo?.url}
                    alt="project image"
                    width={40}
                    height={40}
                    className="rounded"
                  />
                </div>
              )}
              <div className="m-2">{project.maintainingTeam.name}</div>
            </div>
            <div className="flex p-2" title="Maintainer">
              <Core />
            </div>
          </div>
          {project.contributingTeams &&
            project.contributingTeams.length > 0 &&
            project.contributingTeams.map((cteam, index) => {
              return (
                <React.Fragment key={'cteam' + index}>
                  {index < 3 && (
                    <div
                      className="relative flex cursor-pointer gap-[10px] text-[16px] text-[#64748B] hover:bg-slate-100"
                      key={'cteam' + index}
                      onClick={() => {
                        onContributingTeamClicked(cteam);
                      }}
                    >
                      {cteam.logo && (
                        <div>
                          <Image
                            src={cteam.logo}
                            alt="project image"
                            width={40}
                            height={40}
                            className="rounded"
                          />
                        </div>
                      )}
                      {!cteam.logo && (
                        <UserGroupIcon className="inset-y-0 left-2 my-auto mr-[4px] inline h-[40px] w-[40px] rounded bg-gray-200 fill-white" />
                      )}
                      <div className="m-2 max-w-[188px]">{cteam.name}</div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          <AllTeamsModal
            isOpen={seeAllPopup}
            setIsModalOpen={setSeeAllPopup}
            project={project}
          />
        </div>
      )}
    </>
  );
}

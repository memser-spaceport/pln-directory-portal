import { UserGroupIcon } from "@heroicons/react/solid";
import { InputField } from "@protocol-labs-network/ui";
import Modal from "apps/web-app/components/layout/navbar/modal/modal";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import Image from "next/image";
import { useRouter } from "next/router";
import React, { useEffect, useState } from 'react';
import { SearchIcon } from '@heroicons/react/outline';

export function AllTeamsModal({
    isOpen,
    setIsModalOpen,
    project,
}) {
    const router = useRouter();
    const analytics = useAppAnalytics();
    const [searchTerm, setSearchTerm] = useState('');
    const [contributingTeams, setContributingTeams] = useState(
      project.contributingTeams
    );

    useEffect(() => {
      if (searchTerm) {
        const tempContri = contributingTeams.filter((contri) => {
          return contri?.name.toLowerCase().includes(searchTerm.toLowerCase());
        });
        setContributingTeams(tempContri);
      }else{
        setContributingTeams(project.contributingTeams);
      }
    }, [searchTerm]);

    const getMaintainerTeamTemplate = () => {
      return (
        <>
          <div
            className="flex cursor-pointer gap-[10px] text-[16px] text-[#64748B] hover:bg-slate-100"
            onClick={() => {
              onMaintainerTeamClicked(project.maintainingTeam);
            }}
          >
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
        </>
      );
    };

    const onMaintainerTeamClicked = (team) => {
        router.push('/teams/' + team.uid);
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_MAINTAINER_TEAM_CLICKED, {
            teamUid: team.uid,
            teamName: team.name,
        });
    }

    const onContributingTeamClicked = (cteam) => {
        router.push('/teams/' + cteam.uid);
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_DETAIL_CONTRIBUTING_TEAM_CLICKED, {
            teamUid: cteam.uid,
            teamName: cteam.name,
        });
    }

    return (
      <Modal
        isOpen={isOpen}
        onClose={() => setIsModalOpen(false)}
        enableFooter={false}
        enableHeader={false}
      >
        <div className="slim-scroll pt-8">
          <div className="mb-4 px-8 font-bold text-slate-900">
            {'Teams'} ({project.contributingTeams.length + 1})
            <div className="w-full pr-5">
              <InputField
                label="Search"
                name="searchBy"
                showLabel={false}
                icon={SearchIcon}
                placeholder={'Search'}
                className="rounded-[8px] border"
                value={searchTerm}
                onKeyUp={(event) => {
                  // if (
                  //   event.key === 'Enter' ||
                  //   event.keyCode === 13
                  // ) {
                  setSearchTerm(event.currentTarget.value);
                  // }
                }}
                hasClear
                onClear={() => setSearchTerm('')}
              />
            </div>
          </div>
          <div className="github-project-popup overflow-y-auto rounded-xl px-8">
            {searchTerm &&
              project.maintainingTeam?.name
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) &&
              getMaintainerTeamTemplate()}
            {!searchTerm && getMaintainerTeamTemplate()}

            {contributingTeams &&
              contributingTeams.length > 0 &&
              contributingTeams.map((cteam, index) => {
                return (
                  <React.Fragment key={'cteam' + index}>
                    {
                      <div
                        className="flex cursor-pointer gap-[10px] text-[16px] text-[#64748B] hover:bg-slate-100"
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
                        <div className="m-2">{cteam.name}</div>
                      </div>
                    }
                  </React.Fragment>
                );
              })}
            {/* {project?.map((project, i) => {
            return (
                <>
                    HI
                </>
            );
          })} */}
          </div>
          <div className="w-full border-t-2 p-4">
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

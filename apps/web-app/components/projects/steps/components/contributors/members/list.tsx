import { UserGroupIcon, UserIcon } from '@heroicons/react/solid';
import ContributorProfileCard from 'apps/web-app/components/projects/details/contributor-profile-card';
import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import Image from 'next/image';
import React, { useContext, useState } from 'react';

export default function ContributingMembers() {
  const { addProjectsState, addProjectsDispatch } =
    useContext(AddProjectsContext);

  const [contributorHoverFlag, setContributorHoverFlag] = useState(false);
  const [contributorHoveruid, setContributorHoveruid] = useState('');

  return (
    <div className="flex flex-wrap gap-1 p-[12px]">
      {addProjectsState?.inputs?.contributors?.length > 0 &&
        addProjectsState?.inputs?.contributors.map((member) => {
          return (
            <React.Fragment key={member.uid}>
              {!member?.isDeleted && (
                <div
                  className="relative"
                  title={member.name}
                  onMouseOver={() => {
                    setContributorHoveruid(member?.uid);
                    setContributorHoverFlag(true);
                  }}
                  onMouseLeave={() => {
                    setContributorHoverFlag(false);
                  }}
                  onClick={() => {
                    window.open('/members/' + member?.uid, '_blank');
                  }}
                >
                  {member?.logo && (
                    <div className='w-[28px] h-[28px] rounded-full hover:border-[2px] hover:border-[#156FF7]'>
                      <Image
                        src={member.logo}
                        alt="member image"
                        width={28}
                        height={28}
                        className="shrink-0 rounded-full cursor-pointer"
                      />
                    </div>
                  )}
                  {!member?.logo && (
                    <UserIcon className="h-[28px] w-[28px] shrink-0 rounded-full bg-slate-100 fill-slate-200 cursor-pointer hover:border-[2px] hover:border-[#156FF7]" />
                  )}
                  {/* {contributorHoverFlag &&
                    contributorHoveruid === member?.uid && (
                      <ContributorProfileCard
                        uid={member.uid}
                        name={member.name}
                        url={member.logo}
                        role={
                          member.mainTeam?.role
                            ? member.mainTeam.role
                            : 'Contributor'
                        }
                        teamName={member.mainTeam?.team?.name}
                        isTeamLead={member.teamLead}
                      />
                    )} */}
                </div>
              )}
            </React.Fragment>
          );
        })}
    </div>
  );
}

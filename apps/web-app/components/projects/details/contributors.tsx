import { UserIcon } from '@heroicons/react/solid';
import Image from 'next/image';
import { useState } from 'react';
import AllContributorsPopup from './all-contributors-popup';
import ContributorProfileCard from './contributor-profile-card';

export default function Contributors({ project, contributingMembers }) {
  const [allContributorsFlag, setAllContributors] = useState(false);
  const [contributorHoverFlag, setContributorHoverFlag] = useState(false);
  const [contributorHoveruid, setContributorHoveruid] = useState('');

  const contributors =
    project?.contributors?.length > 17
      ? project.contributors.slice(0, 17)
      : project.contributors;

const individualContributors = contributingMembers
        ? contributors?.length < 17
          ? contributingMembers.slice(0, 17 - contributors?.length)
          : []
        : [];

  const getMemberDetailTemplate = (
    uid,
    name,
    url,
    role = '',
    teamName = ''
  ) => {
    return (
      <div
        key={uid}
        title={name}
        className="relative cursor-pointer"
        onMouseOver={() => {
          setContributorHoveruid(uid);
          setContributorHoverFlag(true);
        }}
        onMouseLeave={() => {
            setContributorHoverFlag(false);
        }}
      >
        {url && (
          <Image
            src={url}
            alt="contributors image"
            width={36}
            height={36}
            className="rounded-full"
          />
        )}
        {!url && (
          <UserIcon className="relative inline-block h-[36px] w-[36px] rounded-full bg-gray-200 fill-white" />
        )}
        {contributorHoverFlag && contributorHoveruid === uid && (
          <ContributorProfileCard
            uid={uid}
            name={name}
            url={url}
            role={role}
            teamName={teamName}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px]">
        <div
          className="flex cursor-pointer justify-between border-b border-[#E2E8F0] pb-[14px] text-[18px] font-semibold leading-[28px]"
          onClick={() => {
            setAllContributors(true);
          }}
        >
          <div>Contributors</div>
          <div className="text-xs font-medium not-italic leading-[14px] text-[color:var(--neutral-slate-600,#475569)]">
            <div className="relative top-[5px] rounded-[24px]  bg-[#F1F5F9] px-[8px] py-[2px] ">
              {project?.contributors?.length + contributingMembers?.length}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {project?.contributors?.length > 0 &&
            contributors.map((contri) => {
              const mainTeam = contri.member?.teamMemberRoles?.filter(teamRoles=>{
                return teamRoles?.mainTeam === true;
              });
              
              return getMemberDetailTemplate(
                contri?.member?.uid,
                contri?.member?.name,
                contri.member?.image?.url,
                mainTeam?.length ? mainTeam[0]?.role : '',
                mainTeam?.length ? mainTeam[0]?.team?.name : '',
              );
            })}
          {contributingMembers &&
            individualContributors.map((contri) => {
              const mainTeam = contri.teamMemberRoles?.filter(teamRoles=>{
                return teamRoles?.mainTeam === true;
              });
              return getMemberDetailTemplate(
                contri.uid,
                contri.name,
                contri.image.url,
                mainTeam?.length ? mainTeam[0]?.role : '',
                mainTeam?.length ? mainTeam[0]?.team?.name : '',
              );
            })}
          {project?.contributors?.length > 17 && (
            <div className="relative inline-block h-[36px] w-[36px] rounded-full bg-gray-200 fill-white pt-[5px] text-center">
              {' '}
              +{project?.contributors?.length - 17}
            </div>
          )}
        </div>
      </div>
      {allContributorsFlag && (
        <AllContributorsPopup
          isOpen={allContributorsFlag}
          onClose={() => {
            setAllContributors(false);
          }}
          contributorsList={project?.contributors}
          contributingMembers={contributingMembers}
        />
      )}
    </>
  );
}

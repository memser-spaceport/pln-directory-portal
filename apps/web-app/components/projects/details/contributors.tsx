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
    teamName = '',
    isTeamLead = false
  ) => {
    return (
      <div
        key={uid}
        title={name}
        className="relative"
        onMouseOver={() => {
          setContributorHoveruid(uid);
          setContributorHoverFlag(true);
        }}
        onMouseLeave={() => {
            setContributorHoverFlag(false);
        }}
        onClick={() => {
          window.open('/members/' + uid, '_blank');
        }}
      >
        {url && (
          <div className='w-[36px] h-[36px] rounded-full hover:border-[2px] hover:border-[#156FF7] cursor-pointer'>
            <Image
            src={url}
            alt="contributors image"
            width={36}
            height={36}
            className="rounded-full"
          />
          </div>
        )}
        {!url && (
          <UserIcon className="relative inline-block h-[36px] w-[36px] rounded-full bg-gray-200 fill-white hover:border-[2px] hover:border-[#156FF7] cursor-pointer" />
        )}
        {/* {
        contributorHoverFlag && contributorHoveruid === uid &&
         (
          <ContributorProfileCard
            uid={uid}
            name={name}
            url={url}
            role={role}
            teamName={teamName}
            isTeamLead={isTeamLead}
          />
        )} */}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px]">
        <div
          className="flex cursor-pointer justify-between border-b border-[#E2E8F0] pb-[14px] text-[18px] font-semibold leading-[28px]  hover:text-[#156FF7]"
          onClick={() => {
            setAllContributors(true);
          }}
        >
          <div>Contributors</div>
          <div className="text-xs font-medium not-italic leading-[14px] text-[#156FF7]">
            <div className="relative top-[5px] rounded-[24px]  bg-[#DBEAFE] px-[8px] py-[2px] ">
              {project?.contributors?.length + contributingMembers?.length}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {project?.contributors?.length > 0 &&
            contributors.map((contri) => {
              // const mainTeam = contri.member?.teamMemberRoles?.filter(teamRoles=>{
              //   return teamRoles?.mainTeam === true;
              // });

              // const teamLeadArr = contri.member?.teamMemberRoles?.filter(teamRoles=>{
              //   return teamRoles?.teamLead === true;
              // });

              // return getMemberDetailTemplate(
              //   contri?.member?.uid,
              //   contri?.member?.name,
              //   contri.member?.image?.url,
              //   mainTeam?.length ? mainTeam[0]?.role : '',
              //   mainTeam?.length ? mainTeam[0]?.team?.name : '',
              //   teamLeadArr?.length > 0
              // );

              return getMemberDetailTemplate(
                contri?.uid,
                contri?.name,
                contri?.logo,
                contri?.mainTeam?.role ? contri?.mainTeam?.role : 'Contributor',
                contri?.mainTeam?.team?.name
                  ? contri?.mainTeam?.team?.name
                  : '',
                contri?.teamLead
              );
            })}
          {contributingMembers &&
            individualContributors.map((contri) => {
              const mainTeam = contri.teamMemberRoles?.filter((teamRoles) => {
                return teamRoles?.mainTeam === true;
              });

              const teamLeadArr = contri.teamMemberRoles?.filter(
                (teamRoles) => {
                  return teamRoles?.teamLead === true;
                }
              );
              return getMemberDetailTemplate(
                contri.uid,
                contri.name,
                contri.image?.url,
                mainTeam?.length ? mainTeam[0]?.role : 'Contributor',
                mainTeam?.length ? mainTeam[0]?.team?.name : '',
                teamLeadArr?.length > 0
              );
            })}
          {project?.contributors?.length + contributingMembers?.length > 17 && (
            <div
              className="text-black cursor-pointer relative inline-block h-[36px] w-[36px] bg-gray-200 rounded-full fill-white pt-[5px] text-center rounded-full hover:bg-[#156FF7] hover:text-[#DBEAFE]"
              onClick={() => {
                setAllContributors(true);
              }}
            >
              <span className='relative top-[1px]'>{' '}
              +
              {project?.contributors?.length - 17 + contributingMembers?.length}</span>
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

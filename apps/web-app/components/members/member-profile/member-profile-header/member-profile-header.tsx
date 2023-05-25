import { FlagIcon, LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { AskToEditCard } from '../../../shared/profile/ask-to-edit-card/ask-to-edit-card';
import { ReactComponent as ExploreIcon } from '../../../../public/assets/images/icons/explore.svg';
import { IMember } from '../../../../utils/members.types';
import { ReactComponent as BriefCase } from '../../../../public/assets/images/icons/mdi_briefcase-check.svg';

export function MemberProfileHeader({
  member,
  userInfo,
}: {
  member: IMember;
  userInfo: any;
}) {
  const { image, name, teams, location, teamLead, mainTeam, openToWork } = member;
  const otherTeams = teams
    .filter((team) => team.id !== mainTeam?.id)
    .map((team) => team.name)
    .sort();
  const memberRole = mainTeam?.role || 'Contributor';

  return (
    <div className="relative flex space-x-4">
      <div
        className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-slate-200 ${
          image ? 'bg-white' : 'bg-slate-200'
        }`}
      >
        {image ? (
          <Image
            className="rounded-full"
            alt={`${name} picture`}
            src={image}
            layout="fill"
            objectFit="cover"
            objectPosition="center"
          />
        ) : (
          <UserIcon className="w-24 h-24 fill-white" />
        )}
      </div>
      <div className='max-w-2xl'>
        <Tooltip
          asChild
          trigger={
            <h1 className="mt-0.5 text-2xl font-bold truncate">{name}</h1>
          }
          content={name}
        />
        <div className="flex items-center">
          <div className="max-w-sm overflow-hidden text-ellipsis whitespace-nowrap font-medium">
            {mainTeam?.name}
          </div>
          {otherTeams.length ? (
            <Tooltip
              asChild
              trigger={
                <div className="ml-1 flex w-4 cursor-default">
                  <span className="h-4 w-4 rounded-full bg-slate-100 p-0.5 text-[10px] font-medium leading-3 text-slate-600">
                    +{otherTeams.length}
                  </span>
                </div>
              }
              content={otherTeams.join(', ')}
            />
          ) : null}
        </div>
        <p className="line-clamp-1 text-sm">{memberRole}</p>
        {userInfo?.uid && (
          <div className="mr-2 flex items-center text-sm text-slate-600">
            {location ? (
              <>
                <LocationMarkerIcon className="mr-0.5 h-4 w-4 flex-shrink-0 fill-slate-400" />
                <span className="line-clamp-1 pt-0.5">{location}</span>
              </>
            ) : (
              '-'
            )}
          </div>
        )}
      </div>
      <div className="w-42 flex items-start justify-end">
        {openToWork ? (
          <span className="flex p-3 text-slate-600">
            <BriefCase />
            <span className="pl-1 pt-px text-[10px] font-medium leading-[14px] tracking-[0.01em]">
              OPEN TO WORK
            </span>
          </span>
        ) : null }
      </div>
      {teamLead ? (
        <Tooltip
          asChild
          trigger={
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
              <i className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] not-italic text-white">
                <FlagIcon className="h-[9px]" />
              </i>
            </span>
          }
          content="Team Lead"
        />
      ) : null}
      {(userInfo.uid === member.id ||
        (userInfo.roles?.length > 0 &&
          userInfo.roles.includes('DIRECTORYADMIN'))) && (
        <AskToEditCard profileType="member" member={member} userInfo={userInfo} />
      )}
      </div>
  );
}

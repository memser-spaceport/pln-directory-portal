import { FlagIcon, LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { IMember } from '../../../../utils/members.types';
import { ReactComponent as BriefCase } from '../../../../public/assets/images/icons/mdi_briefcase-check.svg';

export function MemberProfileHeader({
  image,
  name,
  teams,
  location,
  teamLead,
  mainTeam,
  openToWork,
}: IMember) {
  const otherTeams = teams
    .filter((team) => team.id !== mainTeam?.id)
    .map((team) => team.name)
    .sort();
  const memberRole = mainTeam?.role || 'Contributor';
  const isOpenToWorkEnabled = process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK;

  return (
    <div className="flex space-x-4">
      <div
        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 ${
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
          <UserIcon className="w-22 h-22 mt-2 fill-white" />
        )}
      </div>
      <div className="grow">
        <h1 className="text-2xl font-bold">{name}</h1>
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
        <p className="line-clamp-1 mt-0.5 text-sm">{memberRole}</p>
        <div className="mr-2 mt-1 flex items-center text-sm text-slate-600">
          {location ? (
            <>
              <LocationMarkerIcon className="mr-1 h-4 w-4 flex-shrink-0 fill-slate-400" />
              <span className="line-clamp-1">{location}</span>
            </>
          ) : (
            '-'
          )}
        </div>
      </div>
      <div className="w-42 flex items-start justify-end">
        {((isOpenToWorkEnabled === 'true') && openToWork) ? (
          <span className="flex p-3 text-slate-600">
            <BriefCase />
            <span className="pl-1 pt-px text-[12px] font-medium leading-[14px] tracking-[0.01em]">
              OPEN TO WORK
            </span>
          </span>
        ) : null}
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
      </div>
    </div>
  );
}

import { UserGroupIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import { IMember } from 'apps/web-app/utils/members.types';
import Image from 'next/image';
import { AskToEditCard } from '../../../shared/profile/ask-to-edit-card/ask-to-edit-card';
import { ITeam } from '../../../../utils/teams.types';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { ReactComponent as FilecoinIcon } from '/public/assets/images/icons/filecoin-logo.svg';

export function TeamProfileHeader({
  team,
  loggedInMember,
}: {
  team: ITeam;
  loggedInMember: IMember;
}) {
  const { logo, name, industryTags, technologies } = team;
  return (
    <div className="relative flex space-x-4">
      <div
        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 ${
          logo ? 'bg-white' : 'bg-slate-200'
        }`}
      >
        {logo ? (
          <Image
            className="rounded"
            alt={`${name} Logo`}
            src={logo}
            layout="fill"
            objectFit="contain"
            objectPosition="center"
          />
        ) : (
          <UserGroupIcon className="w-22 h-22 mt-2 fill-white" />
        )}
      </div>
      <div className="space-y-4">
        <h1 className="pt-1 text-2xl font-bold">{name}</h1>
        <div>
          {industryTags?.length ? (
            <TagsGroup items={industryTags.map((tag) => tag.title)} />
          ) : (
            <span className="text-xs leading-7 text-slate-400">-</span>
          )}
        </div>
      </div>
      <div className="flex w-24 items-start justify-end">
        {technologies.some((technology) => technology.title === 'Filecoin') ? (
          <Tooltip
            asChild
            trigger={
              <div className="inline-flex h-10 w-10 rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
                <FilecoinIcon className="h-6 w-6 self-center" />
              </div>
            }
            content="Filecoin User"
          />
        ) : null}
        {technologies.some((technology) => technology.title === 'IPFS') ? (
          <Tooltip
            asChild
            trigger={
              <div className="inline-flex h-10 w-10 rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
                <Image
                  src="/assets/images/icons/ipfs-logo.png"
                  alt="IPFS Logo"
                  width="24px"
                  height="24px"
                />
              </div>
            }
            triggerClassName="ml-4"
            content="IPFS User"
          />
        ) : null}
      </div>
      {loggedInMember?.roles?.length > 0 &&
        loggedInMember.roles.includes('DIRECTORYADMIN') && (
          <AskToEditCard profileType="team" team={team} />
        )}
    </div>
  );
}

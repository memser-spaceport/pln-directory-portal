import { LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
import { Tooltip } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../../../components/directory/directory-card/directory-card';
import { DirectoryCardFooter } from '../../../../components/directory/directory-card/directory-card-footer';
import { DirectoryCardHeader } from '../../../../components/directory/directory-card/directory-card-header';

interface MemberCardProps {
  isGrid?: boolean;
  member: IMember;
}

export function MemberCard({ isGrid = true, member }: MemberCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const mainTeam = member.mainTeam;
  const otherTeams = member.teams
    .filter((team) => team.id !== mainTeam?.id)
    .map((team) => team.name)
    .sort();
  const role = member.mainTeam?.role || 'Contributor';

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/directory/members/${member.id}?backLink=${backLink}`}
    >
      <DirectoryCardHeader
        isGrid={isGrid}
        isImageRounded
        img={member.image}
        avatarIcon={UserIcon}
        name={member.name}
        teamLead={member.teamLead}
      />
      <div className={isGrid ? '' : 'w-[400px] grow-0'}>
        <h2
          className={`${
            isGrid ? 'mt-2' : ''
          } line-clamp-1 text-lg font-semibold`}
        >
          {member.name}
        </h2>

        <div
          className={`flex ${
            isGrid ? 'mt-1 flex-col' : 'flex-row items-center'
          }`}
        >
          <div className="flex items-center justify-center">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
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
          <div className={`${isGrid ? 'mt-1' : 'ml-2'} line-clamp-1`}>
            {role}
          </div>
        </div>

        <div
          className={`${isGrid ? 'mt-2 justify-center' : 'mt-1'}
            flex items-center text-sm text-slate-600`}
        >
          {member.location ? (
            <>
              <LocationMarkerIcon className="mr-1 h-4 w-4 flex-shrink-0 fill-slate-400" />
              <span className="line-clamp-1">{member.location}</span>
            </>
          ) : (
            '-'
          )}
        </div>
      </div>
      <DirectoryCardFooter
        isGrid={isGrid}
        tagsArr={member.skills.map((skill) => skill.title)}
      />
    </DirectoryCard>
  );
}

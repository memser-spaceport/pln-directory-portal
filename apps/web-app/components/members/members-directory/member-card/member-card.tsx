import { LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { IMember } from '../../../../utils/members.types';
import { DirectoryCard } from '../../../shared/directory/directory-card/directory-card';
import { DirectoryCardFooter } from '../../../shared/directory/directory-card/directory-card-footer';
import { DirectoryCardHeader } from '../../../shared/directory/directory-card/directory-card-header';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';


interface MemberCardProps {
  isGrid?: boolean;
  member: IMember;
  loggedInMember: any;
}

export function MemberCard({
  isGrid = true,
  member,
  loggedInMember,
}: MemberCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const mainTeam = member.mainTeam;
  const otherTeams = member.teams
    .filter((team) => team.id !== mainTeam?.id)
    .map((team) => team.name)
    .sort();
  const role = member.mainTeam?.role || 'Contributor';
  const analytics = useAppAnalytics()

  const onMemberClicked = () => {
    analytics.captureEvent('member-clicked', {
      uid: member.id,
      name: member.name,
      backLink: backLink
    })
  }

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/directory/members/${member.id}?backLink=${backLink}`}
      handleOnClick={onMemberClicked}
    >
      <DirectoryCardHeader
        isGrid={isGrid}
        isImageRounded
        img={member.image}
        openToWork={member.openToWork}
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
              {(member.teams.length && mainTeam?.name) || '-'}
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
        {loggedInMember?.uid && (
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
        )}
      </div>
      <DirectoryCardFooter
        isGrid={isGrid}
        tagsArr={member.skills.map((skill) => skill.title)}
      />
    </DirectoryCard>
  );
}

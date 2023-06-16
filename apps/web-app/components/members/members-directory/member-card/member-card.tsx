import { LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { IMember } from '../../../../utils/members.types';
import { DirectoryCard } from '../../../shared/directory/directory-card/directory-card';
import { DirectoryCardFooter } from '../../../shared/directory/directory-card/directory-card-footer';
import { DirectoryCardHeader } from '../../../shared/directory/directory-card/directory-card-header';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { OpenToWorkBadge } from '../../../shared/open-to-work-badge/open-to-work-badge';
import { TeamLeadBadge } from '../../../shared/team-lead-badge/team-lead-badge';

import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

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
  // const isOpenToWorkEnabled = (process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK  === 'true' && loggedInMember?.uid) ? true : false;
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const mainTeam = member.mainTeam;
  const otherTeams = member.teams
    .filter((team) => team.id !== mainTeam?.id)
    .map((team) => team.name)
    .sort();
  const role = member.mainTeam?.role || 'Contributor';
  const analytics = useAppAnalytics();
  const isOpenTOWorkEnabled =
    process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK === 'true'
      ? true
      : false;

  const onMemberClicked = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_CLICKED, {
      uid: member.id,
      name: member.name,
      backLink: backLink,
    });
  };

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/directory/members/${member.id}?backLink=${backLink}`}
      handleOnClick={onMemberClicked}
      type="member"
    >
      <DirectoryCardHeader
        isGrid={isGrid}
        isImageRounded
        img={member.image}
        openToWork={member.openToWork}
        avatarIcon={UserIcon}
        name={member.name}
        teamLead={member.teamLead}
        userInfo={loggedInMember}
        type="member"
      />
      <div className={isGrid ? 'px-5' : 'w-[400px] grow-0'}>
        <div className={isGrid ? '' : 'flex'}>
          <h2
            className={`${
              isGrid ? 'mt-2' : ''
            } line-clamp-1 text-lg font-semibold`}
          >
            {member.name}
          </h2>
          {(isOpenTOWorkEnabled) && !isGrid && member.openToWork && (
            <div className="pl-1">
              <OpenToWorkBadge type='CARD'/>
            </div>
          )}
          { !isGrid && member.teamLead && (
            <div className="pl-1">
              <TeamLeadBadge size="5" />
            </div>
          )}
        </div>

        <div
          className={`flex ${
            isGrid ? 'mt-1 flex-col' : 'flex-row items-center'
          }`}
        >
          <div className="flex items-center justify-center">
            <div className="max-w-[250px] font-medium">
              {(member.teams.length && (
                <Tooltip
                  asChild whitespace-nowrap 
                  trigger={
                    <p className="select-none truncate">
                      {mainTeam?.name}
                    </p>
                  }
                  content={mainTeam?.name}
                />
              )) ||
                '-'}
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
        type="member"
      />
    </DirectoryCard>
  );
}

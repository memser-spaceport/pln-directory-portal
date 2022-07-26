import { LocationMarkerIcon } from '@heroicons/react/outline';
import { UserIcon } from '@heroicons/react/solid';
import { IMember } from '@protocol-labs-network/api';
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
  const teamsNames = member.teams.map(({ name }) => name);

  return (
    <DirectoryCard
      isGrid={isGrid}
      cardUrl={`/members/${member.id}?backLink=${backLink}`}
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
        <h2 className={`${isGrid ? 'my-2' : ''} text-lg font-semibold`}>
          {member.name}
        </h2>
        <p className="line-clamp-1">{member.role}</p>
        {member.location ? (
          <div
            className={`mt-2 flex items-center text-sm text-slate-500 ${
              isGrid ? 'justify-center' : ''
            }`}
          >
            <LocationMarkerIcon className="mr-1 h-4 w-4 flex-shrink-0" />
            <span className="line-clamp-1">{member.location}</span>
          </div>
        ) : (
          '-'
        )}
      </div>
      <DirectoryCardFooter isGrid={isGrid} tagsArr={teamsNames} />
    </DirectoryCard>
  );
}

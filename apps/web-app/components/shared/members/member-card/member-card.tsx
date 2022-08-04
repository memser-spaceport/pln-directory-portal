import { LocationMarkerIcon, UserIcon } from '@heroicons/react/solid';
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
        <h2
          className={`${
            isGrid ? 'mt-2' : ''
          } line-clamp-1 text-lg font-semibold`}
        >
          {member.name}
        </h2>
        <p className={isGrid ? 'line-clamp-2 mt-1 h-10' : 'line-clamp-1'}>
          {member.role || 'Contributor'} at {member.teams[0].name}
        </p>

        <div
          className={`${isGrid ? 'mt-2 justify-center' : 'mt-1'}
            } flex items-center text-sm text-slate-600`}
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
      <DirectoryCardFooter isGrid={isGrid} tagsArr={member.skills} />
    </DirectoryCard>
  );
}

import { ITeam } from '@protocol-labs-network/api';
import { AnchorLink } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { DirectoryCard } from '../../directory/directory-card/directory-card';
import { SocialLinks } from '../../shared/social-links/social-links';
import { TagsGroup } from '../../shared/tags-group/tags-group';
import { parseStringsIntoTagsGroupItems } from '../../shared/tags-group/tags-group.utils';

export interface TeamCardProps {
  isClickable?: boolean;
  team: ITeam;
  isGrid?: boolean;
}

export function TeamCard({
  isClickable = false,
  team,
  isGrid = true,
}: TeamCardProps) {
  const router = useRouter();
  const backLink = encodeURIComponent(router.asPath);
  const anchorLinkProps = {
    ...(isClickable ? { href: `/teams/${team.id}?backLink=${backLink}` } : {}),
  };

  return (
    <DirectoryCard isGrid={isGrid}>
      <AnchorLink {...anchorLinkProps}>
        <div className={`flex ${isGrid ? 'flex-col space-y-4' : 'flex-row'}`}>
          <div className={`${isGrid ? 'w-full' : 'w-[496px]'} flex space-x-4`}>
            <div
              className={`h-20 w-20 rounded ${
                team.logo ? 'bg-contain bg-center bg-no-repeat' : 'bg-slate-200'
              }`}
              style={{
                ...(team.logo && { backgroundImage: `url(${team.logo})` }),
              }}
            />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {team.name}
              </h3>
              {!isGrid ? (
                <div className="w-[400px] grow-0">
                  <p className="line-clamp-2 mt-1 leading-5">
                    {team.shortDescription}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          {isGrid ? (
            <p className="line-clamp-3 h-[60px] leading-5">
              {team.shortDescription}
            </p>
          ) : null}
        </div>
      </AnchorLink>

      <div
        className={`h-[28px] ${isGrid ? 'my-4' : 'mx-4 w-[248px] self-center'}`}
      >
        {team.industry && team.industry.length ? (
          <TagsGroup items={parseStringsIntoTagsGroupItems(team.industry)} />
        ) : (
          <span className="text-xs leading-7 text-slate-400">
            Industry not provided
          </span>
        )}
      </div>

      <div
        className={`border-slate-200 ${
          isGrid
            ? 'border-t pt-4'
            : 'flex h-20 w-[99px] items-center justify-center self-center border-l pl-5'
        }`}
      >
        <SocialLinks
          website={{ link: team.website }}
          twitter={{ link: team.twitter }}
        />
      </div>
    </DirectoryCard>
  );
}

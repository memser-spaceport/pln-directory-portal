import Image from 'next/image';
import { SocialLinks } from '../../social-links/social-links';
import { TagsGroup } from '../../tags-group/tags-group';

interface MemberCardProps {
  teamId?: string;
  image?: string;
  name?: string;
  role?: string | string[];
  teams?: { [teamId: string]: string };
  email?: string;
  twitter?: string;
}

export default function MemberCard({
  teamId,
  image,
  name,
  role,
  teams,
  email,
  twitter,
}: MemberCardProps) {
  const memberTeamsTags = Object.keys(teams).map((memberTeamId) => ({
    url: `/teams/${memberTeamId}`,
    label: teams[memberTeamId],
    disabled: teamId === memberTeamId,
  }));

  return (
    <div className="card w-[295px] space-y-4">
      <div className="flex gap-3">
        <div
          className={`h-20 w-20 shrink-0 rounded-full ${
            image ? '' : 'bg-slate-200'
          }`}
        >
          {image ? (
            <Image
              className="rounded-full"
              alt={`${name} Logo`}
              src={image}
              width="100%"
              height="100%"
              layout="responsive"
              objectFit="cover"
            />
          ) : null}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="line-clamp-1">{role}</p>
        </div>
      </div>
      {teams ? (
        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-500">Teams</h4>
          <TagsGroup items={memberTeamsTags} isInline={true} />
        </div>
      ) : null}
      <div className="flex space-x-2 border-t border-slate-200 pt-4">
        <SocialLinks email={{ link: email }} twitter={{ link: twitter }} />
      </div>
    </div>
  );
}

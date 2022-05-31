import Image from 'next/image';
import { SocialLinks } from '../../shared/social-links/social-links';

interface MemberCardProps {
  image?: string;
  name?: string;
  role?: string | string[];
  teams?: { [teamId: string]: string };
  email?: string;
  twitter?: string;
}

export default function MemberCard({
  image,
  name,
  role,
  teams,
  email,
  twitter,
}: MemberCardProps) {
  return (
    <div className="card w-[295px] space-y-4">
      <div className="flex gap-3">
        <div
          className={`w-20 h-20 rounded-full ${image ? '' : 'bg-slate-200'}`}
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
      <div className="flex space-x-2 border-t border-slate-200 pt-4">
        <SocialLinks email={{ link: email }} twitter={{ link: twitter }} />
      </div>
    </div>
  );
}

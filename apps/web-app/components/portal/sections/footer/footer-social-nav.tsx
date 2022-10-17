import Image from 'next/image';
import Link from 'next/link';

const socialLinks = [
  {
    name: 'Discord',
    type: 'discord',
    url: 'https://discord.com/invite/protocollabs',
  },
  {
    name: 'Youtube',
    type: 'youtube',
    url: 'https://www.youtube.com/c/ProtocolLabs',
  },
  {
    name: 'Linkedin',
    type: 'linkedin',
    url: 'https://www.linkedin.com/company/protocollabs',
  },
  {
    name: 'Twitter',
    type: 'twitter',
    url: 'https://twitter.com/protocollabs/status/1493405440620867587',
  },
];

export const FooterSocialNav = () => {
  return (
    <nav className="flex gap-2 sm:gap-4">
      {socialLinks.map((link, i) => (
        <Link key={i} href={link.url}>
          <a
            className="group relative"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src={`/assets/images/icons/${link.type}-round.svg`}
              width="24px"
              height="24px"
              alt={`${link.name} round logo`}
            />
            <div className="absolute top-0 left-0 h-6 w-6 bg-white/25 opacity-0 transition-all duration-150 ease-out group-hover:opacity-100"></div>
          </a>
        </Link>
      ))}
    </nav>
  );
};

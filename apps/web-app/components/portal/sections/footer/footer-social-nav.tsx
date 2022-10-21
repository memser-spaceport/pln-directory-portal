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
    url: 'https://twitter.com/protocollabs',
  },
];

export const FooterSocialNav = () => {
  return (
    <nav className="flex flex-shrink-0 gap-4">
      {socialLinks.map((link, i) => (
        <Link key={i} href={link.url}>
          <a
            className="group relative block h-10 w-10 md:h-6 md:w-6"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src={`/assets/images/icons/${link.type}-round.svg`}
              alt={`${link.name} round logo`}
              layout="fill"
              objectFit="contain"
            />
            <div className="absolute top-0 left-0 h-full w-full bg-white/25 opacity-0 transition-all duration-150 ease-out group-hover:opacity-100"></div>
          </a>
        </Link>
      ))}
    </nav>
  );
};

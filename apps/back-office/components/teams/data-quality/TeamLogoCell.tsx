import React from 'react';
import { LogoEntry } from '../../../hooks/teams/useTeamsEnrichmentReview';
import s from '../../../pages/teams/data-quality.module.scss';

interface Props {
  logo?: LogoEntry;
  name: string;
}

export function TeamLogoCell({ logo, name }: Props) {
  const url =
    logo?.content && typeof logo.content === 'object' && 'url' in logo.content
      ? logo.content.url
      : logo?.content && typeof logo.content === 'string'
      ? logo.content
      : null;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={s.teamLogo}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return <span className={s.teamLogoPlaceholder}>{name.charAt(0).toUpperCase()}</span>;
}

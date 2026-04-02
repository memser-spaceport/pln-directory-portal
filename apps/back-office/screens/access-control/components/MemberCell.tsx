import React from 'react';
import clsx from 'clsx';
import { MemberBasic } from '../types';
import { ExternalLinkIcon } from '../../members/components/icons';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import s from './MemberCell.module.scss';

const directoryMemberUrl = (uid: string) => `${WEB_UI_BASE_URL}/members/${uid}`;

export type MemberCellProps = {
  member: MemberBasic;
  /** When set, opens directory profile in a new tab via the name; external icon is hidden. */
  linkNameToDirectory?: boolean;
};

export const MemberCell = ({ member, linkNameToDirectory }: MemberCellProps) => {
  const profileHref = directoryMemberUrl(member.uid);

  return (
    <div className={s.root}>
      <div className={s.avatar}>
        {member.image?.url ? (
          <img src={member.image.url} alt={member.name} />
        ) : (
          <div className={s.placeholder}>{member.name?.charAt(0) || '?'}</div>
        )}
      </div>
      <div className={s.content}>
        {linkNameToDirectory ? (
          <a
            className={clsx(s.primaryLabel, s.nameLink)}
            href={profileHref}
            target="_blank"
            rel="noreferrer"
          >
            {member.name}
          </a>
        ) : (
          <div className={s.primaryLabel}>{member.name}</div>
        )}
        <div className={s.secondaryLabel}>{member.email}</div>
      </div>
      {!linkNameToDirectory && (
        <div className={s.link}>
          <a href={profileHref} target="_blank" rel="noreferrer">
            <ExternalLinkIcon />
          </a>
        </div>
      )}
    </div>
  );
};

export default MemberCell;

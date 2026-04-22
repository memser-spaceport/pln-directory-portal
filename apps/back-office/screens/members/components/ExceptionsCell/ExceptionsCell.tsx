import React from 'react';
import { Member } from '../../types/member';
import s from './ExceptionsCell.module.scss';

function formatCode(code: string): string {
  const parts = code.split('.');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

function deriveExceptions(member: Member): string[] {
  const effectiveCodes = member.effectivePermissionCodes ?? [];
  if (!effectiveCodes.length) return [];

  const policyCodes = new Set(
    (member.memberPolicies ?? []).map((p) => p.code)
  );

  if (!policyCodes.size) return effectiveCodes;

  return [];
}

const WarningIcon = () => (
  <svg className={s.icon} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 1L11 10H1L6 1Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M6 5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
  </svg>
);

export const ExceptionsCell = ({ member }: { member: Member }) => {
  const exceptions = deriveExceptions(member);
  if (!exceptions.length) return <span className={s.empty}>–</span>;

  const visible = exceptions.slice(0, 2);
  const overflow = exceptions.length - 2;

  return (
    <div className={s.root}>
      {visible.map((code) => (
        <span key={code} className={s.badge}>
          <WarningIcon />
          {formatCode(code)}
        </span>
      ))}
      {overflow > 0 && <span className={s.overflow}>+{overflow}</span>}
    </div>
  );
};

export default ExceptionsCell;

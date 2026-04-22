import React from 'react';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import s from './ModulesCell.module.scss';

const MODULE_LABELS: Record<string, string> = {
  oh: 'OH',
  forum: 'Forum',
  demo_day: 'Demo Day',
  deals: 'Deals',
  founder_guides: 'Founder Guides',
  member: 'Members',
  admin: 'Admin Tool',
};

function getModuleLabel(code: string): string {
  const prefix = code.split('.')[0];
  return MODULE_LABELS[prefix] ?? prefix;
}

export const ModulesCell = ({ policy }: { policy: Policy }) => {
  const modules = [...new Set((policy.policyPermissions ?? []).map((pp) => getModuleLabel(pp.permission.code)))];

  if (!modules.length) return <span className={s.empty}>–</span>;

  const visible = modules.slice(0, 3);
  const overflow = modules.length - 3;

  return (
    <div className={s.root}>
      {visible.map((label) => (
        <span key={label} className={s.chip}>
          {label}
        </span>
      ))}
      {overflow > 0 && <span className={s.overflow}>+{overflow}</span>}
    </div>
  );
};

export default ModulesCell;

import React from 'react';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import s from './PolicyNameCell.module.scss';

const ShieldIcon = () => (
  <svg className={s.icon} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M9 1.5L2.25 4.5V9C2.25 12.7275 5.1675 16.2075 9 17.25C12.8325 16.2075 15.75 12.7275 15.75 9V4.5L9 1.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export const PolicyNameCell = ({ policy }: { policy: Policy }) => (
  <div className={s.root}>
    <ShieldIcon />
    <span className={s.name}>{policy.name}</span>
  </div>
);

export default PolicyNameCell;

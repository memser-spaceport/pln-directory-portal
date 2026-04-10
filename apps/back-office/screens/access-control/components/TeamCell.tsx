import React from 'react';
import { TeamMemberRoleInfo } from '../types';
import s from './TeamCell.module.scss';

interface TeamCellProps {
  teamMemberRoles: TeamMemberRoleInfo[];
  maxDisplay?: number;
}

export const TeamCell = ({ teamMemberRoles, maxDisplay = 3 }: TeamCellProps) => {
  if (!teamMemberRoles || teamMemberRoles.length === 0) {
    return <span className={s.empty}>-</span>;
  }

  const teams = teamMemberRoles.map((tmr) => tmr.team.name);
  const displayTeams = teams.slice(0, maxDisplay);
  const remaining = teams.length - maxDisplay;

  return (
    <div className={s.root}>
      {displayTeams.map((team, index) => (
        <span key={index} className={s.tag}>
          {team}
        </span>
      ))}
      {remaining > 0 && (
        <span className={s.overflowTag}>+{remaining}</span>
      )}
    </div>
  );
};

export default TeamCell;

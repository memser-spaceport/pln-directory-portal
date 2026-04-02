import React from 'react';
import { TeamInfo } from '../types';
import s from './TeamCell.module.scss';

interface TeamCellProps {
  projectContributions: TeamInfo[];
  maxDisplay?: number;
}

export const TeamCell = ({ projectContributions, maxDisplay = 3 }: TeamCellProps) => {
  if (!projectContributions || projectContributions.length === 0) {
    return <span className={s.empty}>-</span>;
  }

  const teams = projectContributions.map((pc) => pc.project.name);
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

import { ITeam } from '@protocol-labs-network/api';
import { TeamCard } from '../../teams/team-card/team-card';

interface MemberProfileTeamsProps {
  teams: ITeam[];
}

export function MemberProfileTeams({ teams }: MemberProfileTeamsProps) {
  return (
    <section>
      <h3 className="mb-2 font-medium text-slate-400">Teams</h3>
      <div className="flex flex-wrap gap-5">
        {teams.map((team) => {
          return <TeamCard key={team.id} team={team} />;
        })}
      </div>
    </section>
  );
}

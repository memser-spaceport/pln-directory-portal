import { TeamCard } from '../../components/TeamCard/TeamCard';
import { MOCK_TEAMS_LIST as TEAMS_LIST } from '../../utils';

const sortTeams = (teams) =>
  teams.sort((a, b) => {
    return a.fields.name < b.fields.name ? -1 : 1;
  });

export function Teams() {
  const sortedTeams = sortTeams(TEAMS_LIST);

  return (
    <section className="px-28 py-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-10">Teams</h1>

      <div className="grid gap-5 grid-cols-4 min-w-[1100px]">
        {sortedTeams.map((item, index) => {
          const {
            id,
            fields: {
              name,
              shortDescription,
              twitter,
              logo,
              industry,
              website,
            },
          } = item;

          return (
            <TeamCard
              key={index}
              teamData={{
                id,
                name,
                shortDescription,
                twitter,
                logo,
                industry,
                website,
              }}
            />
          );
        })}
      </div>

      <div className="mt-8 text-sm text-slate-500">
        Showing <b>{TEAMS_LIST.length}</b> results
      </div>
    </section>
  );
}

export default Teams;

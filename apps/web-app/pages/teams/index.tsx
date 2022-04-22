import { TeamCard } from '../../components/TeamCard/TeamCard';
import { MOCK_TEAMS_LIST as TEAMS_LIST } from '../../utils';

export const sortTeams = (teams) =>
  teams.sort((a, b) => {
    return a.fields.Name < b.fields.Name ? -1 : 1;
  });

export function Teams() {
  const sortedTeams = sortTeams(TEAMS_LIST);

  return (
    <section className="px-28 pt-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-10">Teams</h1>

      <div className="grid gap-5 grid-cols-4">
        {sortedTeams.map((item, index) => {
          const {
            fields: {
              Name,
              ['Short description']: ShortDescription,
              Twitter,
              Logo,
              Industry,
              Website,
            },
          } = item;

          const thumbnails = Logo && Logo[0].thumbnails;
          const logoImage = thumbnails && thumbnails.large.url;

          return (
            <TeamCard
              key={index}
              teamData={{
                Name,
                ShortDescription,
                Twitter,
                logoImage,
                Industry,
                Website,
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

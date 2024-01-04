// import CollabTeams from "./components/contributors/collab-teams";
import Maintainer from "./components/contributors/maintainer";
import { ContributorsContextProvider } from 'apps/web-app/context/projects/contributors.context';
import TeamsContributors from './components/contributors/teams/base';

export default function ProjectContributors() {
  return (
    <>
      {/* <Maintainer />
            <CollabTeams /> */}
      <ContributorsContextProvider>
        <TeamsContributors />
      </ContributorsContextProvider>
    </>
  );
}

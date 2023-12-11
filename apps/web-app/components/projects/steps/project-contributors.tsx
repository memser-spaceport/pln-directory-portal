import CollabTeams from "./components/contributors/collab-teams";
import Maintainer from "./components/contributors/maintainer";

export default function ProjectContributors() {
    return (
        <>
            <Maintainer />
            <CollabTeams />
        </>
    );
}
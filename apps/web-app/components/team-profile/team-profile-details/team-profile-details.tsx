import { ILabber, ITeam } from '@protocol-labs-network/api';
import TeamProfileDescription from '../team-profile-description/team-profile-description';
import TeamProfileFundingStage from '../team-profile-funding-stage/team-profile-funding-stage';
import TeamProfileFundingVehicle from '../team-profile-funding-vehicle/team-profile-funding-vehicle';

interface TeamProfileDetailsProps {
  team: ITeam;
  members: ILabber[];
  membersTeamsNames: { [teamId: string]: string };
}

export default function TeamProfileDetails({
  team,
  members,
  membersTeamsNames,
}: TeamProfileDetailsProps) {
  return (
    <div className="w-full flex flex-col gap-y-6">
      <div className="w-full card">
        <h1 className="text-3xl font-bold mb-4">{team.name}</h1>

        <TeamProfileDescription
          description={team.longDescription || 'Not provided'}
        />
      </div>
      <div className="flex w-full gap-x-6">
        <TeamProfileFundingStage fundingStage={team.fundingStage} />
        <TeamProfileFundingVehicle fundingVehicle={team.fundingVehicle} />
      </div>
    </div>
  );
}

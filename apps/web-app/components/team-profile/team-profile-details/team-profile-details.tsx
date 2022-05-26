import { ITeam } from '@protocol-labs-network/api';
import TeamProfileDescription from '../team-profile-description/team-profile-description';
import TeamProfileFundingStage from '../team-profile-funding-stage/team-profile-funding-stage';
import TeamProfileFundingVehicle from '../team-profile-funding-vehicle/team-profile-funding-vehicle';

interface TeamProfileDetailsProps {
  team: ITeam;
}

export default function TeamProfileDetails({ team }: TeamProfileDetailsProps) {
  return (
    <div className="w-full">
      <div className="w-full card ml-9">
        <h1 className="text-3xl font-bold mb-4">{team.name}</h1>
        <TeamProfileDescription description={team.longDescription} />
      </div>
      <div className="flex w-full mt-6 ml-9 gap-x-6">
        <TeamProfileFundingStage fundingStage={team.fundingStage} />
        <TeamProfileFundingVehicle fundingVehicle={team.fundingVehicle} />
      </div>
    </div>
  );
}

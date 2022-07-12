import { IMember, ITeam } from '@protocol-labs-network/api';
import TeamProfileDescription from '../team-profile-description/team-profile-description';
import TeamProfileFundingStage from '../team-profile-funding-stage/team-profile-funding-stage';
import TeamProfileFundingVehicle from '../team-profile-funding-vehicle/team-profile-funding-vehicle';
import TeamProfileMembers from '../team-profile-members/team-profile-members';

interface TeamProfileDetailsProps {
  team: ITeam;
  members: IMember[];
}

export default function TeamProfileDetails({
  team,
  members,
}: TeamProfileDetailsProps) {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-y-6">
        <div className="card">
          <h1 className="mb-4 text-3xl font-bold">
            {team.name || 'Not provided'}
          </h1>

          <TeamProfileDescription
            description={team.longDescription || 'Not provided'}
          />
        </div>
        <div className="flex gap-x-6">
          <TeamProfileFundingStage fundingStage={team.fundingStage} />
          <TeamProfileFundingVehicle fundingVehicle={team.fundingVehicle} />
        </div>
      </div>
      <div className="mt-6">
        <TeamProfileMembers members={members} />
      </div>
    </div>
  );
}

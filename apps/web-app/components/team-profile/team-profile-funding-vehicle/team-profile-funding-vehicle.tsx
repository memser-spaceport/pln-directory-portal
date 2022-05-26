import { Tags } from '@protocol-labs-network/ui';

interface TeamProfileFundingVehicleProps {
  fundingVehicle?: string[];
}

export default function TeamProfileFundingVehicle({
  fundingVehicle,
}: TeamProfileFundingVehicleProps) {
  const hasFundingVehicles = fundingVehicle && fundingVehicle.length;

  return (
    <div className="w-1/2 card">
      <h3 className="text-base mb-4">Funding Vehicle</h3>
      <div>
        {hasFundingVehicles ? <Tags items={fundingVehicle} /> : 'Not provided'}
      </div>
    </div>
  );
}

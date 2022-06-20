import { Tags } from '@protocol-labs-network/ui';

interface TeamProfileFundingVehicleProps {
  fundingVehicle?: string[];
}

export default function TeamProfileFundingVehicle({
  fundingVehicle,
}: TeamProfileFundingVehicleProps) {
  const hasFundingVehicles = fundingVehicle && fundingVehicle.length;

  return (
    <div className="card w-1/2">
      <h3 className="mb-3 text-sm font-semibold">Funding Vehicle</h3>
      <div>
        {hasFundingVehicles ? <Tags items={fundingVehicle} /> : 'Not provided'}
      </div>
    </div>
  );
}

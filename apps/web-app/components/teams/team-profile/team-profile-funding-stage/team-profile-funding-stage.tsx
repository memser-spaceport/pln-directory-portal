import { Tags } from '@protocol-labs-network/ui';

interface TeamProfileFundingStageProps {
  fundingStage?: string;
}

export default function TeamProfileFundingStage({
  fundingStage,
}: TeamProfileFundingStageProps) {
  const hasFundingStage = fundingStage && fundingStage.length;

  return (
    <div className="card w-1/2">
      <h3 className="mb-3 text-sm font-semibold">Funding Stage</h3>
      <div>
        {hasFundingStage ? <Tags items={[fundingStage]} /> : 'Not provided'}
      </div>
    </div>
  );
}

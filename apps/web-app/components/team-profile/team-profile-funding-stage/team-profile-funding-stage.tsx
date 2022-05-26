import { Tags } from '@protocol-labs-network/ui';

interface TeamProfileFundingStageProps {
  fundingStage?: string;
}

export default function TeamProfileFundingStage({
  fundingStage,
}: TeamProfileFundingStageProps) {
  const hasFundingStage = fundingStage && fundingStage.length;

  return (
    <div className="w-1/2 card">
      <h3 className="text-base mb-3">Funding Stage</h3>
      <div>
        {hasFundingStage ? <Tags items={[fundingStage]} /> : 'Not provided'}
      </div>
    </div>
  );
}

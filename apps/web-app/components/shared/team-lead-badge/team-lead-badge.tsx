import { FlagIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import { ReactComponent as TeamLeadFlag } from '../../../public/assets/images/icons/team-lead.svg';

type TeamLeadBadgeProps = {
  size: '4' | '5';
};

export function TeamLeadBadge({ size }: TeamLeadBadgeProps) {
  return (
    <Tooltip
      trigger={
        <TeamLeadFlag/>
      }
      triggerClassName="on-focus"
      content="Team Lead"
    />
  );
}

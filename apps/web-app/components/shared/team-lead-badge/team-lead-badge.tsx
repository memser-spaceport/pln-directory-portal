import { FlagIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';

type TeamLeadBadgeProps = {
  size: '4' | '5';
};

export function TeamLeadBadge({ size }: TeamLeadBadgeProps) {
  return (
    <Tooltip
      trigger={
        <i
          className={`h-${size} flex w-${size} items-center justify-center rounded-full border border-slate-200 bg-gradient-to-r from-[#427DFF] to-[#44D5BB] not-italic text-white`}
        >
          <FlagIcon className="h-2" />
        </i>
      }
      triggerClassName="on-focus"
      content="Team Lead"
    />
  );
}

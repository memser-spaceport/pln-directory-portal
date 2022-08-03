import { FlagIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';

export function TeamLeadBadge() {
  return (
    <Tooltip
      trigger={
        <i className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-r from-[#427DFF] to-[#44D5BB] not-italic text-white shadow-sm">
          <FlagIcon className="h-2" />
        </i>
      }
      content="Team Lead"
    />
  );
}

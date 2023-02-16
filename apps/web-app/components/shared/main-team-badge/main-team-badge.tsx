import { UserGroupIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';

export function MainTeamBadge() {
  return (
    <Tooltip
      asChild
      trigger={
        <i className="flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-slate-200 bg-gradient-to-r from-[#427DFF] to-[#44D5BB] not-italic text-white">
          <UserGroupIcon className="w-2.5" />
        </i>
      }
      triggerClassName="on-focus"
      content="Main Team"
    />
  );
}

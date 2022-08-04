import { ArrowSmRightIcon, CalendarIcon } from '@heroicons/react/outline';
import { AnchorLink } from '@protocol-labs-network/ui';

type MemberProfileOfficeHoursProps = {
  url?: string;
};

const LEARN_MORE_URL =
  'https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/0ljck9mPhMLfQN6P7ihodQSQPWmWcIfb';

export function MemberProfileOfficeHours({
  url,
}: MemberProfileOfficeHoursProps) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center">
        <span className="mr-3 w-7 rounded bg-blue-100 p-1.5">
          <CalendarIcon className="h-4 w-4 rounded text-blue-700" />
        </span>
        <h3 className="text-lg font-semibold">Office Hours</h3>
      </div>
      <p className="mt-4 text-base">
        A 15 minute time slot for meetings that Members can use to discuss some
        of the most pressing issues their team or organization is currently
        facing.
      </p>
      <div className="mt-6 flex space-x-4">
        {url ? (
          <AnchorLink
            href={url}
            linkClassName="shadow-request-button rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium hover:border-slate-200 hover:text-slate-600 hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 active:border-blue-600 active:ring-2"
          >
            Schedule Meeting
          </AnchorLink>
        ) : (
          <span className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-400">
            Not Available
          </span>
        )}
        <AnchorLink
          href={LEARN_MORE_URL}
          linkClassName="flex items-center text-sm font-semibold"
        >
          Learn more
          <ArrowSmRightIcon className="ml-1 h-4 w-4 -rotate-45" />
        </AnchorLink>
      </div>
    </div>
  );
}

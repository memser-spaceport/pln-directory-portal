import { CalendarIcon, ExternalLinkIcon } from '@heroicons/react/outline';
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
    <div className="card w-80 shrink-0 space-y-4">
      <div className="flex items-center">
        <CalendarIcon className="h-14 w-14" />
        <div className="ml-2">
          <h3 className="text-base font-bold">Office Hours</h3>
          <p className="text-xs text-slate-400">15 minute meetings</p>
        </div>
      </div>
      <p>
        A time-slot for meetings that Labbers can have with other PLN members.
      </p>
      <AnchorLink
        href={LEARN_MORE_URL}
        linkClassName="text-xs underline hover:text-slate-500"
      >
        Learn more
      </AnchorLink>
      {url ? (
        <AnchorLink
          href={url}
          linkClassName="flex justify-end items-center font-medium text-sky-600 hover:text-sky-500"
        >
          Schedule <ExternalLinkIcon className="ml-1 h-5 w-5" />
        </AnchorLink>
      ) : (
        <p className="text-xs text-slate-400">
          This member hasn’t defined the office hours yet.
        </p>
      )}
    </div>
  );
}

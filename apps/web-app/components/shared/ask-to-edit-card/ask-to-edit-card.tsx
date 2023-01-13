import { PencilAltIcon } from '@heroicons/react/outline';
import { trackGoal } from 'fathom-client';
import Link from 'next/link';
import { FATHOM_EVENTS } from '../../../constants';

type TAskToEditProfileType = 'team' | 'member';

interface AskToEditCardProps {
  profileType: TAskToEditProfileType;
}

const urlList: {
  [type in TAskToEditProfileType]: { url: string; eventCode: string };
} = {
  team: {
    url: 'https://airtable.com/shruMa5sP6lUOUsBd',
    eventCode: FATHOM_EVENTS.teams.profile.requestToEdit,
  },
  member: {
    url: 'https://airtable.com/shrjg4lTu61AIMhmL',
    eventCode: FATHOM_EVENTS.members.profile.requestToEdit,
  },
};

export function AskToEditCard({ profileType }: AskToEditCardProps) {
  return (
    <div className="card bg-ask_to_edit_card shadow-card--slate-900 p-7.5">
      <h3 className="flex items-center text-lg font-semibold">
        <span className="mr-3 flex h-7 w-7 items-center justify-center rounded border-[0.5px] border-slate-200 bg-slate-100">
          <PencilAltIcon className="stroke-1.5 h-4 w-4" />
        </span>
        Anything missing?
      </h3>
      <p className="mt-4 mb-6 text-base leading-6">
        As a community, help Teams and Members stay updated with their
        information.
      </p>
      <Link href={urlList[profileType].url}>
        <a
          target="_blank"
          className="on-focus shadow-request-button hover:shadow-on-hover flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium hover:border-slate-200 hover:text-slate-600 hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 active:border-blue-600 active:ring-2 active:ring-blue-300"
          onClick={() =>
            urlList[profileType].eventCode &&
            trackGoal(urlList[profileType].eventCode, 0)
          }
        >
          Request to Edit
        </a>
      </Link>
    </div>
  );
}

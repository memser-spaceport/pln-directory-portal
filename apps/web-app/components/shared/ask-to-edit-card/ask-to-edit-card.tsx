import { PencilAltIcon } from '@heroicons/react/outline';
import Link from 'next/link';

interface AskToEditCardProps {
  profileType: 'team' | 'member';
  profileName: string;
}

const EMAIL_TO_CONTACT = 'spaceport-admin@protocol.ai';
const SUBJECT_TXT = 'Ask to edit';
const LINE_BREAK = '%0D%0A';

export function AskToEditCard({
  profileType,
  profileName,
}: AskToEditCardProps) {
  const bodyText = `Hello,${LINE_BREAK}${LINE_BREAK}I’d like to request the following changes to the ${profileType} ${profileName}'s profile:${LINE_BREAK}1.${LINE_BREAK}2.${LINE_BREAK}3.`;

  return (
    <div className="card bg-ask_to_edit_card shadow-card--slate-900 h-60 p-[30px]">
      <h3 className="flex items-center text-lg font-semibold">
        <span className="mr-3 flex h-7 w-7 items-center justify-center rounded border-[0.5px] border-slate-200 bg-slate-100">
          <PencilAltIcon className="h-4 w-4" />
        </span>
        Anything missing?
      </h3>
      <p className="mt-4 mb-6 text-base">
        As a community, help Teams and Members stay updated with their
        information.
      </p>
      <Link
        href={`mailto:${EMAIL_TO_CONTACT}?subject=${SUBJECT_TXT}&body=${bodyText}`}
      >
        <a className="shadow-request-button flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium hover:border-slate-200 hover:text-slate-600 hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 active:border-blue-600 active:ring-2 active:ring-blue-300">
          Request to Edit
        </a>
      </Link>
    </div>
  );
}

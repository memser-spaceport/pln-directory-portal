import { MailIcon } from '@heroicons/react/outline';
import Link from 'next/link';

interface AskToEditLinkProps {
  profileType: 'team' | 'member';
  profileName: string;
}

const EMAIL_TO_CONTACT = 'spaceport-admin@protocol.ai';
const SUBJECT_TXT = 'Ask to edit';
const LINE_BREAK = '%0D%0A';

export function AskToEditLink({
  profileType,
  profileName,
}: AskToEditLinkProps) {
  const bodyText = `Hello,${LINE_BREAK}${LINE_BREAK}I’d like to request the following changes to the ${profileType} ${profileName}'s profile:${LINE_BREAK}1.${LINE_BREAK}2.${LINE_BREAK}3.`;

  return (
    <Link
      href={`mailto:${EMAIL_TO_CONTACT}?subject=${SUBJECT_TXT}&body=${bodyText}`}
    >
      <a className="flex items-center text-sm text-slate-500 hover:text-slate-600">
        <MailIcon className="mr-1 h-4 w-4" />
        Ask to edit
      </a>
    </Link>
  );
}

import { IMember } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { TeamProfileMember } from './team-profile-member';

interface TeamProfileMembersProps {
  members: IMember[];
}

export function TeamProfileMembers({ members }: TeamProfileMembersProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <>
      <h3 className="mb-2 text-xs font-medium leading-[14px] text-slate-600">
        Members ({members.length})
      </h3>
      <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)]">
        {members.map((member) => (
          <TeamProfileMember key={`${id}.${member.id}`} {...member} />
        ))}
      </div>
    </>
  );
}

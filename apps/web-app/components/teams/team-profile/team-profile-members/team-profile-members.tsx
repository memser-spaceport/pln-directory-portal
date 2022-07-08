import { IMember } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { MemberCard } from '../../../shared/members/member-card/member-card';

interface TeamProfileMembersProps {
  members: IMember[];
}

export default function TeamProfileMembers({
  members,
}: TeamProfileMembersProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <>
      <h3 className="mb-4 font-medium text-slate-500">Members</h3>
      <div className="flex flex-wrap gap-4">
        {members.map((member) => (
          <MemberCard key={`${id}.${member.id}`} member={member} />
        ))}
      </div>
      <div className="mt-8 mb-20 text-sm text-slate-500">
        Showing <b>{members.length}</b> results
      </div>
    </>
  );
}

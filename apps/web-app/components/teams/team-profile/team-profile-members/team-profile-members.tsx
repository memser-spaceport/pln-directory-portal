import { IMemberWithTeams } from '@protocol-labs-network/api';
import MemberCard from '../../../members/member-card/member-card';

interface TeamProfileMembersProps {
  members: IMemberWithTeams[];
}

export default function TeamProfileMembers({
  members,
}: TeamProfileMembersProps) {
  return (
    <>
      <h3 className="text-slate-500 font-medium mb-4">Members</h3>
      <div className="flex flex-wrap gap-4">
        {members.map((member) => (
          <MemberCard key={member.id} {...member} />
        ))}
      </div>
      <div className="text-sm text-slate-500 mt-8 mb-20">
        Showing <b>{members.length}</b> results
      </div>
    </>
  );
}

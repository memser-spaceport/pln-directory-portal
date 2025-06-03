import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { InputField } from '@protocol-labs-network/ui';
import { ReactComponent as SearchIcon } from '../../public/assets/icons/searchicon.svg';

interface TeamMemberRole {
  team: {
    name: string;
  };
  role: string;
}

export interface Member {
  uid: string;
  name: string;
  imageUrl?: string;
  teamMemberRoles: TeamMemberRole[];
}

interface MemberSearchProps {
  onSelect: (member: Member) => void;
  selectedMember: Member | null;
}

export function MemberSearch({ onSelect, selectedMember }: MemberSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedMember) {
      setSearchTerm(selectedMember.name);
    }
  }, [selectedMember]);

  useEffect(() => {
    const searchMembers = async () => {
      if (!searchTerm) {
        setMembers([]);
        return;
      }

      try {
        setIsLoading(true);
        const params = new URLSearchParams({
          name__icontains: searchTerm,
          include: 'teamMemberRoles',
          limit: '10',
          select: 'uid,name,imageUrl,teamMemberRoles.role,teamMemberRoles.team.name',
        });
        const response = await api.get(`/v1/members?${params.toString()}`);
        const data = response.data.members.map((member: any) => ({
          uid: member.uid,
          name: member.name,
          imageUrl: member.imageUrl,
          teamMemberRoles: member.teamMemberRoles || [],
        }));
        setMembers(data);
      } catch (error) {
        console.error('Failed to search members:', error);
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchMembers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  return (
    <div className="relative">
      <div className="mb-2">
        <InputField
          label="Search Member"
          name="member-search"
          showLabel={false}
          icon={SearchIcon}
          placeholder="Type to search members..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          hasClear={!!selectedMember}
          onClear={() => {
            setSearchTerm('');
            onSelect(null);
          }}
        />
      </div>

      {isOpen && searchTerm && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg">
          <ul className="max-h-60 overflow-auto rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {isLoading ? (
              <li className="px-4 py-2 text-gray-500">Loading...</li>
            ) : members.length === 0 ? (
              <li className="px-4 py-2 text-gray-500">No members found</li>
            ) : (
              members.map((member) => (
                <li
                  key={member.uid}
                  className="cursor-pointer px-4 py-2 hover:bg-gray-100"
                  onClick={() => {
                    onSelect(member);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {member.imageUrl ? (
                      <img src={member.imageUrl} alt={member.name} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-500">
                        {member.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{member.name}</div>
                      {member.teamMemberRoles?.[0]?.team && (
                        <div className="text-sm text-gray-500">
                          {member.teamMemberRoles[0].team.name}
                          {member.teamMemberRoles[0].role && ` • ${member.teamMemberRoles[0].role}`}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

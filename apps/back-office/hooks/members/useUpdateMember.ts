import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { MembersQueryKeys } from './constants/queryKeys';

interface MutationParams {
  uid: string;
  authToken: string;
  payload: {
    imageUid: string;
    name: string;
    accessLevel: string;
    email: string;
    joinDate: string;
    bio: string;
    country: string;
    region: string;
    city: string;
    skills: string[];
    teamOrProjectURL: string;
    teamMemberRoles: {
      teamUid: string;
      role: string;
      investmentTeam?: boolean;
    }[];
    linkedinHandler: string;
    discordHandler: string;
    twitterHandler: string;
    telegramHandler: string;
    officeHours: string;
    githubHandler: string;
  };
}

async function mutation({ uid, payload, authToken }: MutationParams) {
  return await api.patch(`/v1/admin/members/edit/${uid}`, payload, {
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS],
      });

      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_LIST],
      });
    },
  });
}

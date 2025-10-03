import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';

interface IMemberResponse {
  uid: string;
  name: string;
  imageUid?: string;
  image?: {
    uid: string;
    url: string;
  };
  email: string;
  isSubscribedToNewsletter: boolean;
  accessLevel: string;
  teamOrProjectURL?: string;
  locationUid?: string;
  location?: {
    uid: string;
    city: string;
    country: string;
    region?: string;
  };
  teamMemberRoles: Array<{
    investmentTeam?: boolean;
    team: {
      uid: string;
      name: string;
    };
  }>;
  projectContributions: [];
  linkedinProfile?: string;
  accessLevelUpdatedAt: string;
  // Other fields that might be present
  bio?: string;
  discordHandler?: string;
  githubHandler?: string;
  linkedinHandler?: string;
  officeHours?: string;
  plnStartDate?: string;
  skills?: [];
  telegramHandler?: string;
  twitterHandler?: string;
}

export const getMemberInfo = async (memberUid: string) => {
  const { data } = await api.get(`/v1/members/${memberUid}`);

  if (!data) {
    return;
  }

  const teamMemberRoles = data.teamMemberRoles.map((tm: any) => {
    return {
      teamTitle: tm.team.name,
      teamUid: tm.teamUid,
      role: tm.role,
      investmentTeam: tm.investmentTeam || false,
    };
  });

  const skills = data.skills.map((sk: any) => {
    return {
      id: sk.uid,
      name: sk.title,
    };
  });

  const projectContributions = data.projectContributions.map((pc: any) => {
    return {
      uid: pc.uid,
      role: pc?.role,
      projectName: pc?.project?.name ?? '',
      projectUid: pc?.project?.uid,
      startDate: pc?.startDate,
      endDate: pc?.endDate,
      description: pc?.description ?? '',
      currentProject: pc?.currentProject ?? false,
    };
  });

  const formatted = {
    ...data,
    imageUrl: data?.image?.url,
    moreDetails: data.moreDetails ?? '',
    openToWork: data.openToWork ?? false,
    officeHours: data.officeHours ?? '',
    projectContributions: projectContributions,
    teamMemberRoles: teamMemberRoles,
    skills: skills,
  };

  return formatted;
};

async function fetcher(uid: string | undefined) {
  if (!uid) {
    return;
  }

  return await getMemberInfo(uid);
}

export function useMember(uid: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBER, uid],
    queryFn: () => fetcher(uid),
    enabled: enabled && Boolean(uid),
  });
}

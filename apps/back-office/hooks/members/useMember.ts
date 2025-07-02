import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';

interface IMemberResponse {
  accessLevel: string;
  accessLevelUpdatedAt: string;
  airtableRecId: string;
  approvedAt: string;
  bio: string;
  createdAt: string;
  discordHandler: string;
  email: string;
  eventGuests: [];
  experiences: [];
  externalId: null;
  githubHandler: string;
  image: { uid: 'uid-8'; cid: 'cid-8'; width: 277; height: 222; url: 'https://loremflickr.com/640/480/animals' };
  imageUid: string;
  imageUrl: string;
  isFeatured: boolean;
  isSubscribedToNewsletter: boolean;
  isUserConsent: boolean;
  isVerified: boolean;
  linkedInDetails: Record<string, string>;
  linkedinHandler: string;
  linkedinProfile: string | null;
  location: {
    uid: 'uid-lake-shannyview';
    placeId: 'placeId-lake-shannyview';
    city: 'Lake Shannyview';
    country: 'United States';
    continent: 'North America';
  };
  locationUid: 'uid-lake-shannyview';
  memberRoles: [];
  moreDetails: string;
  name: string;
  officeHours: string;
  openToWork: boolean;
  plnFriend: boolean;
  plnStartDate: string;
  preferences: Record<string, boolean>;
  projectContributions: [];
  signUpCampaign: string;
  signUpMedium: string;
  signUpSource: string;
  skills: [];
  teamMemberRoles: [];
  teamOrProjectURL: string;
  telegramHandler: string;
  telegramUid: string;
  twitterHandler: string;
  uid: string;
  updatedAt: string;
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

  return { data: formatted };
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

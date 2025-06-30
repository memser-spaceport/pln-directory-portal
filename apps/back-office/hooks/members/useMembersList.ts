import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE } from '../../utils/constants';

interface QueryParams {
  authToken: string | undefined;
}

async function fetcher(params: QueryParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const [listData, allMembers, projectData] = await Promise.all([
    api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`, config),
    api.get(
      `${API_ROUTE.MEMBERS}?pagination=false&orderBy=-createdAt&select=uid,name,teamMemberRoles.team.name,teamMemberRoles.team.uid,projectContributions,email,image.url,teamOrProjectURL,teamMemberRoles.mainTeam,linkedinProfile.uid,accessLevel`,
      config
    ),
    api.get(`${process.env.WEB_API_BASE_URL}${APP_CONSTANTS.V1}projects`),
  ]);

  const pendingMembers = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER);
  return pendingMembers?.map((data) => {
    let projectContributions = [];
    const memberProject = data?.newData?.projectContributions?.map((project) => project.projectUid) || [];

    if (memberProject && memberProject.length > 0) {
      const project = projectData.data.projects.filter((project) => memberProject.includes(project.uid));
      projectContributions.push({ projectTitle: project.map((name) => name.name) });
    } else {
      projectContributions = [];
    }

    return {
      id: data.uid,
      name: data.newData.name,
      status: data.status,
      email: data.newData.email,
      skills: data.newData.skills,
      teamAndRoles: data.newData.teamAndRoles,
      projectContributions: projectContributions,
      isSubscribedToNewsletter: data.newData.isSubscribedToNewsletter,
      teamOrProjectURL: data.newData.teamOrProjectURL,
      imageUrl: data.newData.imageUrl,
      linkedinProfile: {
        name: '@olegonzalezhewewelongnamehere',
        url: 'https://www.linkedin.com/in/olegonzalez/',
      },
    };
  });
}

export function useMembersList(params: QueryParams) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBERS_LIST, params.authToken],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken,
  });
}

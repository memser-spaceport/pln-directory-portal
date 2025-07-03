import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';

export const getMemberInfoFormValues = async () => {
  const baseUrl = process.env.WEB_API_BASE_URL;

  const [teamsInfo, projectsInfo, skillsInfo] = await Promise.all([
    api.get(`${baseUrl}/v1/teams?pagination=false`),
    api.get(`${baseUrl}/v1/projects?pagination=false&select=name,uid,logo.url`),
    api.get(`${baseUrl}/v1/skills?pagination=false`),
  ]);

  if (!teamsInfo || !projectsInfo || !skillsInfo) {
    return { isError: true };
  }

  const teamsData = await teamsInfo.data;
  const projectsData = await projectsInfo.data;
  const skillsData = await skillsInfo.data;

  return {
    teams: teamsData?.teams
      ?.map((d: any) => {
        return {
          teamUid: d.uid,
          teamTitle: d.name,
          role: '',
        };
      })
      .sort((a: any, b: any) => a.teamTitle - b.teamTitle),
    skills: skillsData
      .map((d: any) => {
        return {
          id: d.uid,
          name: d.title,
        };
      })
      .sort((a: any, b: any) => a.name - b.name),
    projects: projectsData?.projects
      ?.map((d: any) => {
        return {
          projectUid: d.uid,
          projectName: d.name,
          projectLogo: d.logo?.url ?? '/icons/default-project.svg',
        };
      })
      .sort((a: any, b: any) => a.projectName - b.projectName),
  };
};

async function fetcher() {
  return getMemberInfoFormValues();
}

export function useMemberFormOptions(enabled = true) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_SKILLS_OPTIONS],
    queryFn: fetcher,
    enabled,
    staleTime: 30000,
  });
}

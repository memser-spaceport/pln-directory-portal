import React, { useEffect } from 'react';
import { IRequest } from '../utils/request.types';
import { GetServerSideProps } from 'next';
import api from '../utils/api';
import RequestList from '../components/request-list';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE } from '../utils/constants';
import { useNavbarContext } from '../context/navbar-context';
import { ApprovalLayout } from '../layout/approval-layout';
import { parseCookies } from 'nookies';
import Error from '../components/error/error';

export default function PendingList(props) {
  const { setIsOpenRequest, setMemberList, setTeamList, isTeamActive, setShowMenu } = useNavbarContext();
  setShowMenu(true);

  if (props.isError) return <Error />;
  
  useEffect(() => {
    setMemberList([...props.memberList, ...props.unverifiedMembers]);
    setTeamList(props.teamList);
    setIsOpenRequest(true);
  }, [isTeamActive, setMemberList, props.memberList, props.teamList, setTeamList, setIsOpenRequest]);

  return (
    <ApprovalLayout>
      <RequestList
        plnadmin={props.plnadmin}
        list={isTeamActive ? [...props.teamList] : [...props.memberList, ...props.unverifiedMembers]}
        type={APP_CONSTANTS.PENDING_LABEL}
      />
    </ApprovalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<IRequest> = async (context) => {
  const { plnadmin } = parseCookies(context);
  let isError = false;
  let memberResponse = [];
  let teamResponse = [];
  let team = [];
  let member = [];
  let membersCount = 0;
  let unverifiedMembers = [];

  try {
    if (!plnadmin) {
      const currentUrl = context.resolvedUrl;
      const loginUrl = `/?backlink=${currentUrl}`;
      return {
        redirect: {
          destination: loginUrl,
          permanent: false,
        },
      };
    }
    const config = {
      headers: {
        authorization: `Bearer ${plnadmin}`,
      },
    };
    const [listData, unVerifiedMembes, projectData] = await Promise.all([
      api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`, config),
      api.get(
        `${API_ROUTE.MEMBERS}?isVerified=false&pagination=false&orderBy=-createdAt&select=uid,name,teamMemberRoles.team.name,teamMemberRoles.team.uid,projectContributions,email,imageUrl,isVerified,teamOrProjectURL,teamMemberRoles.mainTeam`,
        config
      ),
      api.get(`${process.env.WEB_API_BASE_URL}${APP_CONSTANTS.V1}projects`),
    ]);
    if (listData.data) {
      teamResponse = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.TEAM);
      memberResponse = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER);
      member = memberResponse?.map((data) => {
        const skills = data?.newData?.skills || [];
        const teamAndRoles = data?.newData?.teamAndRoles || [];
        const memberProject = data?.newData?.projectContributions?.map((project) => project.projectUid) || [];
        let projectContributions = [];
        if (memberProject && memberProject.length > 0) {
          let project = projectData.data.projects.filter((project) => memberProject.includes(project.uid));
          projectContributions.push({ projectTitle: project.map((name) => name.name) });
        } else {
          projectContributions = [];
        }
        const isSubscribedToNewsletter = data?.newData?.isSubscribedToNewsletter ?? false;
        const teamOrProjectURL = data?.newData?.teamOrProjectURL || '';
        const imageUrl = data?.newData?.imageUrl || '';

        return {
          id: data.uid,
          name: data.newData.name,
          status: data.status,
          email: data.newData.email,
          skills: skills,
          teamAndRoles: Array.isArray(teamAndRoles) ? teamAndRoles : [],
          projectContributions: projectContributions,
          isSubscribedToNewsletter: isSubscribedToNewsletter,
          teamOrProjectURL: teamOrProjectURL,
          imageUrl: imageUrl,
        };
      });

      unverifiedMembers = unVerifiedMembes.data.members.map((data) => {
        const imageUrl = data?.imageUrl || '';
        const teamOrProjectURL = data?.teamOrProjectURL || '';
        let teamAndRoles = [];
        let projectContributions = [];

        if (data?.teamMemberRoles[0]?.team) {
          teamAndRoles.push({
            teamUid: data.teamMemberRoles[0].team.uid,
            teamTitle: data.teamMemberRoles[0].team.name,
          });
        } else {
          teamAndRoles = [];
        }
        const memberProject = data?.projectContributions.map((project) => project.projectUid) || [];
        if (memberProject && memberProject.length > 0) {
          let project = projectData.data.projects.filter((project) => memberProject.includes(project.uid));
          projectContributions.push({ projectTitle: project.map((name) => name.name) });
        } else {
          projectContributions = [];
        }
        return {
          id: data.uid,
          name: data.name,
          email: data.email,
          imageUrl: imageUrl,
          teamAndRoles: Array.isArray(teamAndRoles) ? teamAndRoles : [],
          projectContributions: projectContributions,
          teamOrProjectURL: teamOrProjectURL,
          isVerified: data?.isVerified || false,
        };
      });

      team = teamResponse?.map((data) => {
        return {
          id: data.uid,
          name: data.newData.oldName ?? data.newData.name,
          status: data.status,
          email: data.newData.email,
          skills: data.newData.skills,
          teamAndRoles: data.newData.teamAndRoles,
          isSubscribedToNewsletter: data.newData.isSubscribedToNewsletter,
        };
      });
    }
    membersCount = member?.length + unverifiedMembers?.length;
    return {
      props: {
        memberList: member,
        unverifiedMembers: unverifiedMembers,
        teamList: team,
        teamCount: team?.length ?? 0,
        memberCount: membersCount ?? 0,
        plnadmin,
        isError,
      },
    };
  } catch (error) {
    return {
      props: {
        memberList: [],
        unverifiedMembers: [],
        teamList: [],
        teamCount: 0,
        memberCount: 0,
        plnadmin: '',
        isError: true,
      },
    };
  }
};

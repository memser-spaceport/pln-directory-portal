import React, { useEffect } from 'react';
import { IRequest } from '../utils/request.types';
import { GetServerSideProps } from 'next';
import api from '../utils/api';
import RequestList from '../components/request-list';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE } from '../utils/constants';
import { useNavbarContext } from '../context/navbar-context';
import { ApprovalLayout } from '../layout/approval-layout';
import { parseCookies } from 'nookies';

export default function PendingList(props) {
  const { setIsOpenRequest, setMemberList, setTeamList, isTeamActive, setShowMenu, memberList, teamList } = useNavbarContext();
  setShowMenu(true);

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
  const listData = await api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`, config);
  const unVerifiedMembes = await api.get(`${API_ROUTE.MEMBERS}?isVerified=false&pagination=false`, config);

  let memberResponse = [];
  let teamResponse = [];
  let team = [];
  let member = [];
  let membersCount = 0;
  let unverifiedMembers = [];
  if (listData.data) {
    teamResponse = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.TEAM);
    memberResponse = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER);
    member = memberResponse?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.name,
        status: data.status,
      };
    });
    unverifiedMembers = unVerifiedMembes.data.members.map((data) => {
      return {
        id: data.uid,
        name: data.name,
        isVerified: data?.isVerified || false,
      };
    });

    team = teamResponse?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.oldName ?? data.newData.name,
        status: data.status,
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
    },
  };
};

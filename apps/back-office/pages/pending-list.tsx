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
  const { setIsOpenRequest, setMemberList, setTeamList, isTeamActive } =
    useNavbarContext();

  useEffect(() => {
    setMemberList(props.memberList);
    setTeamList(props.teamList);
    setIsOpenRequest(true);
  }, [
    isTeamActive,
    setMemberList,
    props.memberList,
    props.teamList,
    setTeamList,
    setIsOpenRequest,
  ]);

  return (
    <ApprovalLayout>
      <RequestList
        list={isTeamActive ? props.teamList : props.memberList}
        type={APP_CONSTANTS.PENDING_LABEL}
      />
    </ApprovalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<IRequest> = async (
  context
) => {
  const { plnadmin } = parseCookies(context);
  console.log('plnadmin', plnadmin);

  if (!plnadmin) {
    console.log('insidet');
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
  const listData = await api.get(
    `${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`,
    config
  );
  let memberResponse = [];
  let teamResponse = [];
  let team = [];
  let member = [];
  if (listData.data) {
    teamResponse = listData.data.filter(
      (item) => item.participantType === ENROLLMENT_TYPE.TEAM
    );
    memberResponse = listData.data.filter(
      (item) => item.participantType === ENROLLMENT_TYPE.MEMBER
    );
    member = memberResponse?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.name,
        status: data.status,
      };
    });
    team = teamResponse?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.name,
        status: data.status,
      };
    });
  }
  return {
    props: {
      memberList: member,
      teamList: team,
      teamCount: team?.length ?? 0,
      memberCount: member?.length ?? 0,
    },
  };
};

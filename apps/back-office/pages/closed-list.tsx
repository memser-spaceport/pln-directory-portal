import React, { useEffect } from 'react';
import { IRequest } from '../utils/request.types';
import { GetServerSideProps } from 'next';
import api from '../utils/api';
import RequestList from '../components/request-list';
import APP_CONSTANTS, { ENROLLMENT_TYPE } from '../utils/constants';
import { useNavbarContext } from '../context/navbar-context';
import { ApprovalLayout } from '../layout/approval-layout';

type RequestList = {
  list: IRequest[];
};

export default function ClosedList(props) {
  const { setIsOpenRequest, setMemberList, setTeamList, isTeamActive } =
    useNavbarContext();

  useEffect(() => {
    setMemberList(props.memberList);
    setTeamList(props.teamList);
    setIsOpenRequest(false);
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
        type={APP_CONSTANTS.CLOSED_FLAG}
      />
    </ApprovalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<IRequest> = async ({
  query,
  res,
}) => {
  const listData = await api.get(`/v1/participants-request`);

  let memberResponse = [];
  let teamResponse = [];
  let team = [];
  let member = [];
  if (listData.data) {
    teamResponse = listData.data.filter(
      (item) =>
        item.participantType === ENROLLMENT_TYPE.TEAM &&
        item.status !== APP_CONSTANTS.PENDING_LABEL
    );
    memberResponse = listData.data.filter(
      (item) =>
        item.participantType === ENROLLMENT_TYPE.MEMBER &&
        item.status !== APP_CONSTANTS.PENDING_LABEL
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

import { Fragment, useEffect, useState } from 'react';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE, ROUTE_CONSTANTS } from '../utils/constants';
import MemberTable from './member-table/member-table';
import Tab from './tab/tab';
import Loader from './common/loader';
import router from 'next/router';
import api from '../utils/api';
import { useNavbarContext } from '../context/navbar-context';

const MemberRequestList = (props: any) => {
  const dataList = [...props.members];
  const type = props?.type;
  const [currentTab, setCurrentTab] = useState(APP_CONSTANTS.PENDING_FLAG);
  const [isLoading, setIsLoading] = useState(false);

  const [allMembers, setAllMembers] = useState({ pending: [], unverified: [] });
  const { setMemberList } = useNavbarContext();

  useEffect(() => {
    if (type !== APP_CONSTANTS.CLOSED_FLAG) {
      updateMembers();
    }
  }, []);

  const updateMembers = async () => {
    setIsLoading(true);
    const config = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    const [listData, unVerifiedMembers] = await Promise.all([
      api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`, config),
      api.get(`${API_ROUTE.MEMBERS}?isVerified=false&pagination=false&orderBy=-createdAt`, config),
    ]);

    const pendingMembers = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER);

    const formattedPendingMembes = pendingMembers?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.name,
        status: data.status,
      };
    });

    const filteredUnVerifiedMembers = unVerifiedMembers.data.members.map((data) => {
      return {
        id: data.uid,
        name: data.name,
        isVerified: data?.isVerified || false,
      };
    });

    setAllMembers({
      pending: [...formattedPendingMembes],
      unverified: [...filteredUnVerifiedMembers],
    });
    setIsLoading(false);
    setMemberList([...formattedPendingMembes, ...filteredUnVerifiedMembers]);
  };

  const availableTabs = [
    { label: APP_CONSTANTS.PENDING_LABEL, name: APP_CONSTANTS.PENDING_FLAG, count: allMembers.pending.length },
    {
      label: APP_CONSTANTS.UNVERIFIED_LABEL,
      name: APP_CONSTANTS.UNVERIFIED_FLAG,
      count: allMembers.unverified.length,
    },
  ];

  const onTabSelected = (name: string) => {
    setCurrentTab(name);
  };

  const onTabClickHandler = (name: string) => {
    onTabSelected(name);
  };

  function redirectToDetail(request) {
    setIsLoading(true);
    const route = ROUTE_CONSTANTS.MEMBER_VIEW;
    router.push({
      pathname: route,
      query: {
        id: request.id,
      },
    });
  }

  return (
    <>
      <div className="w-[650px]">
        {isLoading && <Loader />}

        {type !== APP_CONSTANTS.CLOSED_FLAG && (
          <>
            <div className="flex w-fit rounded-[8px] bg-white">
              {availableTabs.map((tab: any, index: number) => (
                <Fragment key={`${tab.label}-${index}`}>
                  <Tab
                    onClick={onTabClickHandler}
                    count={tab.count}
                    name={tab.name}
                    isSelected={tab.name === currentTab}
                  />
                </Fragment>
              ))}
            </div>
            <div className="mt-[14px] pb-[100px]">
              <MemberTable
                plnadmin={props?.plnadmin}
                updateMembers={updateMembers}
                allMembers={allMembers[currentTab.toLowerCase()]}
                selectedTab={currentTab}
              />
            </div>
          </>
        )}

        {type === APP_CONSTANTS.CLOSED_FLAG && (
          <>
            {dataList &&
              dataList.map((request, index) => {
                const borderClass =
                  dataList.length == 1
                    ? 'rounded-xl'
                    : index == 0
                    ? 'rounded-tl-xl rounded-tr-xl'
                    : index == dataList.length - 1
                    ? 'rounded-bl-xl rounded-br-xl'
                    : '';
                return (
                  <div
                    className={`h-[60px] w-[656px] cursor-pointer border-b border-[#E2E8F0]
                bg-[#FFFFFF] drop-shadow-[0_0_1px_rgba(15,23,42,0.12)] hover:bg-[#F8FAFC] ${borderClass}`}
                    key={request.id}
                    onClick={() => redirectToDetail(request)}
                  >
                    <div
                      className="h-full w-full items-center pl-[24px] pr-[24px] pt-[20px]
                  text-[14px] leading-[20px] text-[#475569]"
                    >
                      <span className="text-sm font-semibold">{request?.name}</span>
                      {request.status !== APP_CONSTANTS.PENDING_LABEL && (
                        <span
                          className={`float-right text-[12px] ${
                            request.status === APP_CONSTANTS.APPROVED_FLAG ? 'text-[#0F9F5A]' : 'text-[#D65229]'
                          }`}
                        >
                          {request.status === 'REJECTED' ? APP_CONSTANTS.REJECTED_LABEL : APP_CONSTANTS.APPROVED_LABEL}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </>
  );
};

export default MemberRequestList;

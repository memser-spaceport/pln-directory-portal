import api from 'apps/back-office/utils/api';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE, ROUTE_CONSTANTS } from 'apps/back-office/utils/constants';
import router from 'next/router';
import { useState } from 'react';
import { toast } from 'react-toastify';
import Loader from '../common/loader';
import { useNavbarContext } from 'apps/back-office/context/navbar-context';

const MemberTable = (props: any) => {
  const members = props?.members ?? [];
  const setAllMembers = props?.setAllMembers;
  const selectedTab = props?.selectedTab ?? '';

  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedMembers, setSelectedMembes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSort, setIsSort] = useState(false);
  const { setMemberList } = useNavbarContext();


  // const onSortClickHandler = () => {
  //   setIsSort(!isSort);
  //   const sortedMembers = members.sort((a: any, b: any) => {
  //     if (isSort) {
  //       return a.name.localeCompare(b.name);
  //     } else {
  //       return b.name.localeCompare(a.name);
  //     }
  //   });
  //   setAllMembers(sortedMembers);
  // };

  const onSelectAllClickHandler = () => {
    setIsAllSelected(!isAllSelected);
    if (isAllSelected) {
      setSelectedMembes([]);
    } else {
      setSelectedMembes(members.map((member: any) => member.id));
    }
  };

  const onMemberSelectHandler = (id: any) => {
    setIsAllSelected(false);
    if (selectedMembers.includes(id)) {
      const filteredMembes = selectedMembers.filter((uid) => uid !== id);
      setSelectedMembes(filteredMembes);
      if (filteredMembes.length === members.length) {
        setIsAllSelected(true);
      }
    } else {
      const addedMembes = [...selectedMembers, id];
      setSelectedMembes(addedMembes);
      if (addedMembes.length === members.length) {
        setIsAllSelected(true);
      }
    }
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

  const onSuccessHandler = async () => {
    setIsLoading(true);
    const config = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    const listData = await api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}?status=PENDING`, config);
    const unVerifiedMembes = await api.get(`${API_ROUTE.MEMBERS}?isVerified=false&pagination=false`, config);
    const pendingMembers = listData.data.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER);

    const formattedPendingMembes = pendingMembers?.map((data) => {
      return {
        id: data.uid,
        name: data.newData.name,
        status: data.status,
      };
    });
    const filteredUnVerifiedMembers = unVerifiedMembes.data.members.map((data) => {
      return {
        id: data.uid,
        name: data.name,
        isVerified: data?.isVerified || false,
      };
    });

    setMemberList([...formattedPendingMembes, ...filteredUnVerifiedMembers]);

    setAllMembers({
      pending: formattedPendingMembes,
      unverified: filteredUnVerifiedMembers,
    });
  };

  async function approvelClickHandler(id: any, status: any, isVerified: any) {
    const data = {
      status: status,
      participantType: ENROLLMENT_TYPE.MEMBER,
      isVerified,
    };
    const configuration = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    setIsLoading(true);
    try {
      let message="";
      setIsLoading(true);
      if (selectedTab === APP_CONSTANTS.PENDING_FLAG) {
        await api.patch(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, data, configuration);
       message = `Successfully ${APP_CONSTANTS.UNVERIFIED_FLAG}`;

      } else {
        await api.post(`${API_ROUTE.MEMBERS}/${id}`, [id], configuration);
       message = `Successfully ${APP_CONSTANTS.VERIFIED_FLAG}`;

      }

      onSuccessHandler();
      toast(message);
    } catch (error: any) {
      if (error.response?.status === 500) {
        router.push({
          pathname: ROUTE_CONSTANTS.INTERNAL_SERVER_ERROR,
        });
      } else if (error.response?.status === 400) {
        toast(error.response?.data?.message || 'Bad request');
      } else {
        toast(error.message || 'An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function bulkApprovedClickHandler(isVerified: any) {
    const data = selectedMembers.map((memberId: any) => {
      return {
        uid: memberId,
        status: APP_CONSTANTS.APPROVED_FLAG,
        partcipantType: ENROLLMENT_TYPE.MEMBER,
        isVerified,
      };
    });
    const configuration = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    try {
      setIsAllSelected(false);
      setSelectedMembes([]);
      setIsLoading(true);
      if (selectedTab === APP_CONSTANTS.PENDING_FLAG) {
        await api.post(`${API_ROUTE.PARTICIPANTS_REQUEST}`, data, configuration);
      } else {
        const data = selectedMembers?.map((memberId: any) => memberId);
        await api.post(`${API_ROUTE.MEMBERS}`, { memberIds: data }, configuration);
      }
      onSuccessHandler();
      const message = `Successfully ${APP_CONSTANTS.APPROVED_LABEL}`;
      toast(message);
    } catch (error: any) {
      if (error.response?.status === 500) {
        router.push({
          pathname: ROUTE_CONSTANTS.INTERNAL_SERVER_ERROR,
        });
      } else if (error.response?.status === 400) {
        toast(error.response?.data?.message || 'Bad request');
      } else {
        toast(error.message || 'An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const onRemoveClickHandler = async (members: any) => {
    const data = members.map((memberId: any) => {
      return {
        uid: memberId,
        status: APP_CONSTANTS.REJECTED_FLAG,
        partcipantType: ENROLLMENT_TYPE.MEMBER,
      };
    });
    const configuration = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    try {
      setIsLoading(true);
      await api.post(`${API_ROUTE.PARTICIPANTS_REQUEST}`, data, configuration);
      onSuccessHandler();
      setSelectedMembes([]);
      setIsAllSelected(false);
      const message = `Successfully ${APP_CONSTANTS.REJECTED_LABEL}`;
      toast(message);
    } catch (error: any) {
      if (error.response?.status === 500) {
        router.push({
          pathname: ROUTE_CONSTANTS.INTERNAL_SERVER_ERROR,
        });
      } else if (error.response?.status === 400) {
        toast(error.response?.data?.message || 'Bad request');
      } else {
        toast(error.message || 'An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isLoading && <Loader />}
      {members?.length > 0 && (
        <div className="bg-white  shadow-[0px_0px_1px_0px_#0F172A1F]">
          {/* Header */}
          <div className="sticky top-0 flex rounded-t-[8px] border-b border-b-[#E2E8F0] bg-white py-[8px] px-[24px]">
            <div className="flex w-[45%] items-center gap-[10px]">
              <button
                className={`flex h-[20px] w-[20px] items-center justify-center rounded-[4px] border border-[#CBD5E1] ${
                  isAllSelected ? 'bg-[#156FF7]' : ''
                }`}
                onClick={() => onSelectAllClickHandler()}
              >
                {isAllSelected && <img alt="mode" src="/assets/images/right_white.svg" />}
              </button>
              <span className="text-[13px] font-bold">Applicant Name</span>
              {/* <button onClick={onSortClickHandler}>
              <img src="/assets/images/sort-unselected.svg" alt="sort" />
            </button> */}
            </div>
            <div className="text-[13px] font-bold">Actions</div>
          </div>
          {/* Members */}
          <div className="">
            {members?.map((member: any, index: number) => {
              const isSelected = selectedMembers.includes(member.id) || isAllSelected;
              const isDisableOptions = selectedMembers.length > 0;
              return (
                <div
                  key={`${member.id}-${index}`}
                  className="flex items-center border-b border-b-[#E2E8F0] py-[20px] px-[24px]"
                >
                  <div className="flex w-[45%] gap-[10px]">
                    <button
                      className={`flex h-[20px] w-[20px] items-center justify-center rounded-[4px] border border-[#CBD5E1] ${
                        isSelected ? 'bg-[#156FF7]' : ''
                      }`}
                      onClick={() => onMemberSelectHandler(member.id)}
                    >
                      {isSelected && <img alt="mode" src="/assets/images/right_white.svg" />}
                    </button>
                    <span className="max-w-[225px] overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-bold text-[#475569]">
                      {member.name}
                    </span>
                  </div>

                  {/* Options */}
                  <div className="flex gap-[8px]">
                    <button
                      onClick={() => redirectToDetail(member)}
                      className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                        isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                      }`}
                    >
                      View
                    </button>

                    <button
                      className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                        isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                      }`}
                      onClick={() => approvelClickHandler(member.id, APP_CONSTANTS.APPROVED_FLAG, true)}
                    >
                      <img
                        height={20}
                        width={20}
                        src={!isDisableOptions ? '/assets/images/verified.svg' : '/assets/images/verified-disabled.svg'}
                        alt="verified"
                      />
                      Verified
                    </button>

                    {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                      <button
                        className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                          isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                        }`}
                        onClick={() => approvelClickHandler(member.id, APP_CONSTANTS.APPROVED_FLAG, false)}
                      >
                        <img
                          height={20}
                          width={20}
                          src={
                            !isDisableOptions
                              ? '/assets/images/unverified.svg'
                              : '/assets/images/unverified-disabled.svg'
                          }
                          alt="verified"
                        />
                        Unverified
                      </button>
                    )}

                    {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                      <button
                        onClick={() => onRemoveClickHandler([member.id])}
                        className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                          isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                        }`}
                      >
                        <img
                          height={20}
                          width={20}
                          src={!isDisableOptions ? '/assets/images/delete.svg' : '/assets/images/delete-disabled.svg'}
                          alt="verified"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {members?.length === 0 && (
        <div
          className="h-[60px] w-[656px] border-b border-[#E2E8F0]
    bg-[#FFFFFF] drop-shadow-[0_0_1px_rgba(15,23,42,0.12)] hover:bg-[#F8FAFC]"
          key="no_data"
        >
          <div
            className="h-full w-full items-center pl-[24px] pr-[24px] pt-[20px]
      text-[14px] leading-[20px] text-[#475569]"
          >
            <span className="text-sm font-semibold">{APP_CONSTANTS.NO_DATA_AVAILABLE_LABEL}</span>
          </div>
        </div>
      )}

      {selectedMembers?.length > 0 && (
        <div className="fixed right-0 left-0 bottom-0 flex h-[80px] w-full items-center justify-center border-t border-t-[#E2E8F0] bg-white">
          <div className="flex w-[650px] items-center justify-start px-[24px]">
            <div className="w-[45%] text-[14px] font-[600] text-[#475569]">
              {`${selectedMembers.length} Applicant${selectedMembers.length > 1 ? 's' : ''} selected`}
            </div>

            <div className="flex gap-[8px]">
              <button
                className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                onClick={() => bulkApprovedClickHandler(true)}
              >
                <img height={20} width={20} src="/assets/images/verified.svg" alt="verified" />
                Verified
              </button>

              {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                <button
                  onClick={() => bulkApprovedClickHandler(false)}
                  className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                >
                  <img height={20} width={20} src="assets/images/unverified.svg" alt="verified" />
                  Unverified
                </button>
              )}

              {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                <button
                  onClick={() => onRemoveClickHandler(selectedMembers)}
                  className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                >
                  <img height={20} width={20} src="/assets/images/delete.svg" alt="verified" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MemberTable;

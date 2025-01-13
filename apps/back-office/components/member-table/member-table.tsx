import api from 'apps/back-office/utils/api';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE, ROUTE_CONSTANTS } from 'apps/back-office/utils/constants';
import router from 'next/router';
import { useState } from 'react';
import { toast } from 'react-toastify';
import Loader from '../common/loader';
import Image from 'next/image';
import { Tooltip } from '@protocol-labs-network/ui';
import SkillTag from '../tag/skill-tag';
import DeleteModal from '../delete-modal/delete-modal';
import { UserIcon } from '@heroicons/react/solid';

const MemberTable = (props: any) => {
  const selectedTab = props?.selectedTab ?? '';
  const allMembers = props?.allMembers ?? [];
  const updateMembers = props?.updateMembers;

  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedMembers, setSelectedMembes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [rejectId, setRejectId] = useState([]);

  const onSelectAllClickHandler = () => {
    setIsAllSelected(!isAllSelected);
    if (isAllSelected) {
      setSelectedMembes([]);
    } else {
      setSelectedMembes(allMembers.map((member: any) => member.id));
    }
  };

  const onMemberSelectHandler = (id: any) => {
    if (selectedMembers.includes(id)) {
      setIsAllSelected(false);
      const filteredMembes = selectedMembers.filter((uid) => uid !== id);
      setSelectedMembes(filteredMembes);
      if (filteredMembes.length === allMembers.length) {
        setIsAllSelected(true);
      }
    } else {
      const addedMembes = [...selectedMembers, id];
      setSelectedMembes(addedMembes);
      if (addedMembes.length === allMembers.length) {
        setIsAllSelected(true);
      }
    }
  };

  function onRedirectToMemberDetail(request) {
    setIsLoading(true);
    const route = ROUTE_CONSTANTS.MEMBER_VIEW;
    const from = selectedTab === APP_CONSTANTS.PENDING_FLAG ? 'pending' : 'approved';
    router.push({
      pathname: route,
      query: {
        id: request.id,
        from,
      },
    });
  }

  async function onMemberApprovalClickHandler(id: any, status: any, isVerified: any) {
    const data = {
      status: status,
      participantType: ENROLLMENT_TYPE.MEMBER,
      isVerified,
      uid: id,
    };
    const configuration = {
      headers: {
        authorization: `Bearer ${props.plnadmin}`,
      },
    };
    setIsLoading(true);
    try {
      let message = '';
      setIsLoading(true);
      if (selectedTab === APP_CONSTANTS.PENDING_FLAG) {
        await api.post(`${API_ROUTE.PARTICIPANTS_REQUEST}`, [data], configuration);
        message = `Successfully ${
          status === APP_CONSTANTS.REJECTED_FLAG
            ? APP_CONSTANTS.REJECTED_LABEL
            : isVerified
            ? APP_CONSTANTS.VERIFIED_FLAG
            : APP_CONSTANTS.UNVERIFIED_FLAG
        }`;
      } else {
        await api.post(`${API_ROUTE.ADMIN_APPROVAL}`, { memberIds: [id] }, configuration);
        message = `Successfully ${APP_CONSTANTS.VERIFIED_FLAG}`;
      }

      updateMembers();
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

  async function onBulkApprovedClickHandler(isVerified: any) {
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
      setSelectedMembes([]);
      setIsLoading(true);
      if (selectedTab === APP_CONSTANTS.PENDING_FLAG) {
        await api.post(`${API_ROUTE.PARTICIPANTS_REQUEST}`, data, configuration);
      } else {
        const data = selectedMembers?.map((memberId: any) => memberId);
        await api.post(`${API_ROUTE.ADMIN_APPROVAL}`, { memberIds: data }, configuration);
      }
      updateMembers();
      setIsAllSelected(false);
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
      updateMembers();
      setSelectedMembes([]);
      setIsAllSelected(false);
      const message = `Successfully ${APP_CONSTANTS.REJECTED_LABEL}`;
      setOpenModal(false);
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
      setOpenModal(false);
      setIsLoading(false);
    }
  };

  const onHandleOpen = (id: any) => {
    setOpenModal(true);
    if (Array.isArray(id)) {
      setRejectId(id);
    } else {
      setRejectId(id);
    }
  };

  return (
    <>
      {isLoading && <Loader />}
      {allMembers?.length > 0 && (
        <div className="w-[1190px] rounded-t-lg bg-white shadow-[0px_0px_1px_0px_#0F172A1F]">
          {/* Header */}
          <div className="sticky top-0 flex h-[42px] w-full flex-wrap rounded-t-[8px] border-b border-b-[#E2E8F0] bg-white py-[8px] px-[24px]">
            <div className="flex w-[315px] items-center gap-[10px]">
              <button
                className={`flex h-[20px] w-[20px] items-center justify-center rounded-[4px] border border-[#CBD5E1] ${
                  isAllSelected ? 'bg-[#156FF7]' : ''
                }`}
                onClick={() => onSelectAllClickHandler()}
              >
                {isAllSelected && <img alt="mode" src="/assets/images/right_white.svg" />}
              </button>
              <div className="flex gap-[4px]">
                <span className="text-[13px] font-bold">Member Name</span>
                <div
                  className="flex h-[18px] w-[18px] items-center justify-center rounded"
                  style={{ backgroundColor: '#E2E8F0' }}
                >
                  <img src="/assets/icons/group.svg" alt="Group" />
                </div>
              </div>
            </div>
            <div className="flex w-[175px] items-center gap-[4px]">
              <span className="flex items-center text-[13px] font-bold">Team/Project Name</span>
              <div
                className="flex h-[18px] w-[18px] items-center justify-center rounded"
                style={{ backgroundColor: '#E2E8F0' }}
              >
                <img src="/assets/icons/group.svg" alt="Group" />
              </div>
            </div>
            <span className="flex w-[240px] items-center text-[13px] font-bold">Skills</span>
            <div className="flex items-center gap-[14px]">
              <span className="w-[130px] text-[13px] font-bold">Newsletter Signup</span>
              <span className="text-[13px] font-bold">Actions</span>
            </div>
          </div>
          {/* Members */}
          <div className="">
            {allMembers?.map((member: any, index: number) => {
              const isSelected = selectedMembers.includes(member.id) || isAllSelected;
              const isDisableOptions = selectedMembers.length > 0;
              const visibleSkills = member?.skills && member.skills.slice(0, 2);
              const remainingSkills = member?.skills && member.skills.slice(2);
              return (
                <div
                  key={`${member.id}-${index}`}
                  className="flex h-[83px] items-center border-b border-b-[#E2E8F0] py-[20px] px-[24px]"
                >
                  <div className="flex w-[315px] items-center gap-[10px]">
                    <button
                      className={`flex h-[20px] w-[20px] items-center justify-center rounded-[4px] border border-[#CBD5E1] ${
                        isSelected ? 'bg-[#156FF7]' : ''
                      }`}
                      onClick={() => onMemberSelectHandler(member.id)}
                    >
                      {isSelected && <img alt="mode" src="/assets/images/right_white.svg" />}
                    </button>
                    <div className="h-[40px] w-[40px]">
                      {member.imageUrl ? (
                        <img
                          src={member.imageUrl}
                          className="rounded object-cover w-full h-full"
                        />
                      ) : (
                        <img
                          src="/assets/icons/default_profile"
                          alt="Profile Image"
                          className="rounded object-cover w-full h-full"
                        />
                      )}
                    </div>

                    <div className="w-[240px]">
                      <div>
                        <Tooltip
                          trigger={<span className="overflow-hidden whitespace-nowrap text-[14px]">{member.name}</span>}
                          content={member.name}
                        />
                      </div>
                      <div>
                        <Tooltip
                          trigger={
                            <span className="text-semibold w-full overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[#475569]">
                              {member.email}
                            </span>
                          }
                          content={member.email}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex w-[165px]">
                    <div className="flex flex-col gap-[4px]">
                      <span className="overflow-hidden whitespace-nowrap text-[14px]">
                        {member.projectContributions &&
                          member.projectContributions.map((project) => (
                            <Tooltip
                              trigger={<span key={index}>{project.projectTitle}</span>}
                              content={project.projectTitle}
                            />
                          ))}
                        {member.teamAndRoles &&
                          member.teamAndRoles.map((team) => (
                            <Tooltip trigger={<span key={index}>{team.teamTitle}</span>} content={team.teamTitle} />
                          ))}
                      </span>
                      {member.projectContributions && (
                        <div
                          className="h-[22px] w-[70px] whitespace-nowrap rounded-md text-center text-[14px] font-semibold"
                          style={{ backgroundColor: '#C050E61A', color: '#C050E6' }}
                        >
                          Projects
                        </div>
                      )}
                      {member.teamAndRoles && (
                        <div
                          className="h-[22px] w-[60px] whitespace-nowrap rounded-md text-center text-[14px] font-bold"
                          style={{ backgroundColor: '#156FF71A', color: '#156FF7' }}
                        >
                          Teams
                        </div>
                      )}
                      {member.teamOrProjectURL && (
                        <div className="flex gap-[6px]">
                          <a
                            href={member.teamOrProjectURL}
                            target="_blank"
                            className="h-[22px] cursor-pointer whitespace-nowrap rounded-md text-center text-[14px] font-semibold text-blue-600"
                          >
                            Link
                          </a>
                          <img src="/assets/icons/link_icon.svg" width={15} height={15} alt="Link" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex w-[285px] flex-wrap gap-[6px]">
                    {member?.skills && member?.skills.length > 2 ? (
                      <>
                        {visibleSkills.map((skill) => (
                          <SkillTag value={skill.title} />
                        ))}
                        <SkillTag value={'+' + remainingSkills.length} remainContent={remainingSkills} />
                      </>
                    ) : (
                      <>{member?.skills && member.skills.map((skill) => <SkillTag value={skill.title} />)}</>
                    )}
                  </div>
                  <div className="flex w-[95px] justify-center">
                    <img
                      src={
                        member.isSubscribedToNewsletter
                          ? '/assets/icons/tick_green.svg'
                          : '/assets/icons/cross_icon.svg'
                      }
                      height={12}
                      width={12}
                      alt="Subscription Plan"
                    />
                  </div>
                  {/* Options */}
                  <div className="ml-6 flex gap-[8px]">
                    <button
                      onClick={() => onRedirectToMemberDetail(member)}
                      className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                        isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                      }`}
                    >
                      Edit
                    </button>

                    {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                      <button
                        className={`flex items-center justify-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                          isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                        }`}
                        onClick={() => onMemberApprovalClickHandler(member.id, APP_CONSTANTS.APPROVED_FLAG, false)}
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
                        Unverify
                      </button>
                    )}

                    <button
                      className={`flex items-center justify-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                        isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
                      }`}
                      onClick={() => onMemberApprovalClickHandler(member.id, APP_CONSTANTS.APPROVED_FLAG, true)}
                    >
                      <img
                        height={20}
                        width={20}
                        src={!isDisableOptions ? '/assets/images/verified.svg' : '/assets/images/verified-disabled.svg'}
                        alt="verified"
                      />
                      Verify
                    </button>

                    {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                      <button
                        onClick={() => onHandleOpen([member.id])}
                        className={`flex items-center justify-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
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
      {allMembers?.length === 0 && (
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
              {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                <button
                  onClick={() => onBulkApprovedClickHandler(false)}
                  className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                >
                  <img height={20} width={20} src="assets/images/unverified.svg" alt="verified" />
                  Unverify
                </button>
              )}

              <button
                className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                onClick={() => onBulkApprovedClickHandler(true)}
              >
                <img height={20} width={20} src="/assets/images/verified.svg" alt="verified" />
                Verify
              </button>

              {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
                <button
                  onClick={() => onHandleOpen(selectedMembers)}
                  className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]`}
                >
                  <img height={20} width={20} src="/assets/images/delete.svg" alt="verified" />
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {openModal && (
        <DeleteModal setOpenModal={setOpenModal} onRemoveClickHandler={onRemoveClickHandler} rejectId={rejectId} />
      )}
    </>
  );
};

export default MemberTable;

import { Tooltip } from '@protocol-labs-network/ui';
import APP_CONSTANTS from 'apps/back-office/utils/constants';
import { Skill } from 'apps/back-office/utils/members.types';
import React from 'react';
import SkillTag from '../tag/skill-tag';
interface MemberListProps {
  isSelected: boolean;
  isDisableOptions: boolean;
  visibleSkills: Skill[];
  remainingSkills: Skill[];
  member: any;
  selectedTab: any;
  onRedirectToMemberDetail: (e: any) => void;
  onMemberSelectHandler: (id: number) => void;
  onMemberApprovalClickHandler: (id: number, data: string, isApproved: boolean) => void;
  onHandleOpen: (e: number[]) => void;
}
const MemberList = (props: MemberListProps) => {
  const {
    isDisableOptions,
    isSelected,
    visibleSkills,
    remainingSkills,
    member,
    onMemberSelectHandler,
    onRedirectToMemberDetail,
    onMemberApprovalClickHandler,
    selectedTab,
    onHandleOpen,
  } = props;
  return (
    <div className="flex h-[83px] items-center border-b border-b-[#E2E8F0] py-[20px] px-[24px]">
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
            <img src={member.imageUrl} className="h-full w-full rounded object-cover" />
          ) : (
            <img
              src="/assets/icons/default_profile.svg"
              alt="Profile Image"
              className="h-full w-full rounded object-cover"
            />
          )}
        </div>
        <div className="w-[240px] overflow-hidden">
          <Tooltip
            asChild
            trigger={
              <p className="w-[230px] overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">{member.name}</p>
            }
            content={member.name}
          />
          <Tooltip
            asChild
            trigger={
              <p className="text-semibold block w-[230px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[#475569]">
                {member.email}
              </p>
            }
            content={member.email}
          />
        </div>
      </div>

      <div className="flex w-[165px]">
        <div className="flex flex-col gap-[4px]">
          {member.projectContributions &&
            member.projectContributions.length > 0 &&
            member.projectContributions.map((project) => (
              <Tooltip
                asChild
                key={member.id}
                trigger={
                  <p className="w-[155px] overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">
                    {project.projectTitle}
                  </p>
                }
                content={project.projectTitle}
              />
            ))}
          {member.teamAndRoles &&
            member.teamAndRoles.length > 0 &&
            member.teamAndRoles.map((team) =>
              team && team.teamTitle ? (
                <Tooltip
                  asChild
                  key={member.id}
                  trigger={
                    <p className="w-[155px] overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">
                      {team.teamTitle}
                    </p>
                  }
                  content={team.teamTitle}
                />
              ) : null
            )}
          {member.projectContributions && member.projectContributions.length > 0 && (
            <div
              className="h-[22px] w-[70px] overflow-hidden text-ellipsis whitespace-nowrap rounded-md text-center text-[14px] font-semibold"
              style={{ backgroundColor: '#C050E61A', color: '#C050E6' }}
            >
              Projects
            </div>
          )}
          {member.teamAndRoles && member.teamAndRoles.length > 0 && (
            <div
              className="h-[22px] w-[60px] overflow-hidden text-ellipsis whitespace-nowrap rounded-md text-center text-[14px] font-bold"
              style={{ backgroundColor: '#156FF71A', color: '#156FF7' }}
            >
              Teams
            </div>
          )}
          {member.teamOrProjectURL && member.teamOrProjectURL.length > 0 && (
            <div className="flex gap-[6px]">
              <Tooltip
                asChild
                key={member.id}
                trigger={
                  <a
                    href={member.teamOrProjectURL}
                    target="_blank"
                    className="h-[22px] cursor-pointer whitespace-nowrap rounded-md text-center text-[14px] font-semibold text-blue-600"
                  >
                    Link
                  </a>
                }
                content={member.teamOrProjectURL}
              />

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
        {selectedTab === APP_CONSTANTS.PENDING_FLAG && (
          <img
            src={member.isSubscribedToNewsletter ? '/assets/icons/tick_green.svg' : '/assets/icons/cross_icon.svg'}
            height={12}
            width={12}
            alt="Subscription Plan"
          />
        )}
      </div>
      {/* Options */}
      <div className="ml-3 flex gap-[8px]">
        <button
          onClick={() => onRedirectToMemberDetail(member)}
          className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
            isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
          }`}
        >
          {selectedTab === APP_CONSTANTS.PENDING_FLAG ? 'Edit' : 'View Profile'}
        </button>
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
          <>
            <button
              className={`flex items-center justify-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${
                isDisableOptions ? 'cursor-not-allowed text-[#94A3B8]' : ''
              }`}
              onClick={() => onMemberApprovalClickHandler(member.id, APP_CONSTANTS.APPROVED_FLAG, false)}
            >
              <img
                height={20}
                width={20}
                src={!isDisableOptions ? '/assets/images/unverified.svg' : '/assets/images/unverified-disabled.svg'}
                alt="verified"
              />
              Unverify
            </button>

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
          </>
        )}
      </div>
    </div>
  );
};

export default MemberList;

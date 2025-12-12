import APP_CONSTANTS, {
  ROUTE_CONSTANTS,
  TABLE_SORT_ICONS,
  TABLE_SORT_VALUES,
} from 'apps/back-office/utils/constants';
import router from 'next/router';
import { Fragment, useEffect, useState } from 'react';
import Loader from '../common/loader';

const RolesTable = (props: any) => {
  const members = props?.allMembers ?? [];
  const [allMembers, setAllMembers] = useState(members);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState(TABLE_SORT_VALUES.DEFAULT);

  useEffect(() => {
    setAllMembers(members);
  }, [members]);

  const onRedirectToMemberDetail = (member: any) => {
    setIsLoading(true);
    router.push({
      pathname: ROUTE_CONSTANTS.MEMBER_VIEW,
      query: { id: member.id, from: 'roles' },
    });
  };

  const onSortMembersByName = () => {
    const sortOrderKeys = Object.keys(TABLE_SORT_VALUES);
    const currentSortIndex = sortOrderKeys.indexOf(sortOrder);
    const nextSortIndex = (currentSortIndex + 1) % sortOrderKeys.length;
    const nextSortOrder = sortOrderKeys[nextSortIndex];

    if (nextSortOrder === TABLE_SORT_VALUES.ASCENDING) {
      const sortedMembers = [...allMembers].sort((a, b) => a.name.localeCompare(b.name));
      setAllMembers(sortedMembers);
      setSortOrder(nextSortOrder);
    } else if (nextSortOrder === TABLE_SORT_VALUES.DESCENDING) {
      const sortedMembers = [...allMembers].sort((a, b) => b.name.localeCompare(a.name));
      setAllMembers(sortedMembers);
      setSortOrder(nextSortOrder);
    } else {
      setAllMembers(members);
      setSortOrder(nextSortOrder);
    }
  };

  const sortImg = TABLE_SORT_ICONS[sortOrder];

  return (
    <>
      {isLoading && <Loader />}

      {allMembers?.length > 0 && (
        <div className="w-[800px] rounded-t-lg bg-white shadow-[0px_0px_1px_0px_#0F172A1F]">
          {/* Header */}
          <div className="sticky top-0 flex h-[42px] w-full flex-wrap rounded-t-[8px] border-b border-b-[#E2E8F0] bg-white py-[8px] px-[24px]">
            <div className="flex w-[300px] items-center gap-[10px]">
              <div className="flex gap-[4px]">
                <span className="text-[13px] font-bold">Member Name</span>
                <div
                  className="flex h-[18px] w-[18px] flex-col items-center justify-center rounded"
                  style={{ backgroundColor: '#E2E8F0' }}
                >
                  <img src={sortImg} alt="Sort" className="cursor-pointer" onClick={onSortMembersByName} />
                </div>
              </div>
            </div>
            <div className="flex w-[400px] items-center gap-[4px]">
              <span className="flex items-center text-[13px] font-bold">Roles</span>
            </div>
          </div>

          {/* Rows */}
          <div>
            {allMembers?.map((member: any) => {
              const roles = member.roles || member.role || [];
              const rolesText = Array.isArray(roles) ? roles.join(', ') : roles;

              return (
                <Fragment key={member.id}>
                  <div
                    className="flex h-[60px] w-full cursor-pointer items-center border-b border-[#E2E8F0] bg-[#FFFFFF] px-[24px] text-[13px] hover:bg-[#F8FAFC]"
                    onClick={() => onRedirectToMemberDetail(member)}
                  >
                    <div className="flex w-[300px] items-center">
                      <span className="font-medium text-[#0F172A]">{member.name}</span>
                    </div>
                    <div className="flex w-[400px] items-center">
                      <span className="text-[#475569]">
                        {rolesText || APP_CONSTANTS.NO_DATA_AVAILABLE_LABEL}
                      </span>
                    </div>
                  </div>
                </Fragment>
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
    </>
  );
};

export default RolesTable;

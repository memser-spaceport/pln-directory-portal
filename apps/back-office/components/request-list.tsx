import { InputField } from '@protocol-labs-network/ui';
import { useEffect, useState } from 'react';
import { ReactComponent as SearchIcon } from '../public/assets/icons/searchicon.svg';
import APP_CONSTANTS from '../utils/constants';
import TeamRequestList from './team-request-list';
import { useNavbarContext } from '../context/navbar-context';
import MemberRequestList from './member-request-list';

export default function RequestList({ list, type, plnadmin }) {
  const [dataList, setDataList] = useState([]);
  const { isTeamActive } = useNavbarContext();

  useEffect(() => {
    setDataList(list);
  }, [list, isTeamActive]);

  const backupList = list;

  function searchList(input = '') {
    if (input === '') {
      setDataList(backupList);
    } else {
      setDataList(backupList.filter((req) => req.name.toLowerCase().includes(input.toLowerCase())));
    }
  }

  return (
    <>
      <div className="webkit-available absolute flex w-full justify-center overflow-auto bg-[#F5F6F7]">
        <div className="relative pt-[26px]">
          {type !== APP_CONSTANTS.PENDING_LABEL && (
            <div className="mb-[20px] border-b border-[#E2E8F0] pb-[20px]">
              <InputField
                label="Search"
                name="searchBy"
                showLabel={false}
                icon={SearchIcon}
                placeholder="Search"
                onKeyUp={(event) => {
                  if (event.key === 'Enter' || event.keyCode === 13) {
                    searchList(event.currentTarget.value);
                  }
                }}
                hasClear
                onClear={() => searchList()}
              />
            </div>
          )}
          {dataList.length > 0 && (
            <>
              {isTeamActive && <TeamRequestList teams={dataList} />}
              {!isTeamActive && <MemberRequestList type={type} members={dataList} plnadmin={plnadmin} />}
            </>
          )}

          {dataList.length === 0 && (
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
        </div>
      </div>
    </>
  );
}

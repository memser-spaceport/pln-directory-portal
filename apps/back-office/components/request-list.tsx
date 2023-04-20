import React from 'react';
import { SearchIcon } from '@heroicons/react/outline';
import APP_CONSTANTS, { ROUTE_CONSTANTS } from '../utils/constants';
import { InputField } from '@protocol-labs-network/ui';
import { useNavbarContext } from '../context/navbar-context';
import router from 'next/router';
import { useState } from 'react';
import { useEffect } from 'react';
import Loader from '../components/common/loader';

export default function RequestList({ list, type }) {
  const { isTeamActive } = useNavbarContext();
  const [dataList, setDataList] = useState([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setDataList(list);
  }, [list]);

  const backupList = list;
  function redirectToDetail(request) {
    setIsLoading(true);
    const route = isTeamActive
      ? ROUTE_CONSTANTS.TEAM_VIEW
      : ROUTE_CONSTANTS.MEMBER_VIEW;
    router.push({
      pathname: route,
      query: {
        id: request.id,
      },
    });
  }

  function searchList(input = '') {
    if (input === '') {
      setDataList(backupList);
    } else {
      setDataList(
        backupList.filter((req) =>
          req.name.toLowerCase().includes(input.toLowerCase())
        )
      );
    }
  }

  return (
    <>
      {isLoading && <Loader />}
      <div className="webkit-available absolute flex w-full justify-center overflow-auto bg-[#F5F6F7]">
        <div className="relative pt-[32px]">
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
          {dataList &&
            dataList.map((request) => {
              return (
                <div
                  className="h-[60px] w-[656px] cursor-pointer border-b border-[#E2E8F0]
                bg-[#FFFFFF] drop-shadow-[0_0_1px_rgba(15,23,42,0.12)] hover:bg-[#F8FAFC]"
                  key={request.id}
                  onClick={() => redirectToDetail(request)}
                >
                  <div
                    className="h-full w-full items-center pl-[24px] pr-[24px] pt-[20px]
                  text-[14px] leading-[20px] text-[#475569]"
                  >
                    <span className="font-semibold ">{request?.name}</span>
                    {request.status !== APP_CONSTANTS.PENDING_LABEL && (
                      <span
                        className={`float-right text-[12px] ${
                          request.status === APP_CONSTANTS.APPROVED_FLAG
                            ? 'text-[#0F9F5A]'
                            : 'text-[#D65229]'
                        }`}
                      >
                        {request.status === 'REJECTED'
                          ? APP_CONSTANTS.REJECTED_LABEL
                          : APP_CONSTANTS.APPROVED_LABEL}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
                <span className="font-semibold ">
                  {APP_CONSTANTS.NO_DATA_AVAILABLE_LABEL}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

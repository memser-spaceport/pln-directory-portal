import { useState } from "react";
import APP_CONSTANTS, { ROUTE_CONSTANTS } from "../utils/constants";
import Loader from "./common/loader";
import { useNavbarContext } from "../context/navbar-context";
import router from 'next/router';
import { formatDateTime } from "../utils/services/shared";



const TeamRequestList = (props: any) => {
    const dataList = props?.teams;
    const  [isLoading, setIsLoading] = useState(false);

    function redirectToDetail(request) {
        setIsLoading(true);
        const route = ROUTE_CONSTANTS.TEAM_VIEW
        router.push({
          pathname: route,
          query: {
            id: request.id,
          },
        });
      }

    return <>
          {isLoading && <Loader />}
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
                    className="h-full w-full flex items-center justify-between pl-[24px] pr-[24px]
                  text-[14px] leading-[20px] text-[#475569]"
                  >
                    <span className="text-sm font-semibold">
                      {request?.name}
                    </span>
                    {request.status !== APP_CONSTANTS.PENDING_LABEL && (
                      <div
                        className={`flex flex-col items-end text-[12px] ${
                          request.status === APP_CONSTANTS.APPROVED_FLAG
                            ? 'text-[#30C593]'
                            : 'text-[#FF7777]'
                        }`}
                      >
                        {request.status === 'REJECTED'
                          ? APP_CONSTANTS.REJECTED_LABEL
                          : APP_CONSTANTS.APPROVED_LABEL}
                        {request?.approvedAt && <div className="text-[12px] italic font-normal text-[#94A3B8]">on {formatDateTime(request?.approvedAt)}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
    </>
}

export default TeamRequestList;
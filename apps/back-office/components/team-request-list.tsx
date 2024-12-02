import { useState } from "react";
import APP_CONSTANTS, { ROUTE_CONSTANTS } from "../utils/constants";
import Loader from "./common/loader";
import { useNavbarContext } from "../context/navbar-context";
import router from 'next/router';



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
                    className="h-full w-full items-center pl-[24px] pr-[24px] pt-[20px]
                  text-[14px] leading-[20px] text-[#475569]"
                  >
                    <span className="text-sm font-semibold">
                      {request?.name}
                    </span>
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
    </>
}

export default TeamRequestList;
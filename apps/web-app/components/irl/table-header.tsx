const TableHeader = (props: any) => {
  const isUserLoggedIn = props.isUserLoggedIn ?? false;
  return <>
      {isUserLoggedIn && <div className="sticky top-0  z-[2] flex h-[42px] w-fit lg:w-[calc(100%_-_2px)] rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm">
        <div className="flex w-[200px] items-center justify-start pl-[20px]">
          Name
        </div>
        <div className="flex w-[200px] items-center justify-start">Team</div>
        <div className="flex w-[150px] items-center justify-start">
          Telegram
        </div>
        <div className="flex w-[330px] items-center justify-start pr-[20px]">
        What are you hoping to get out of this event?
        </div>
      </div>}
      {!isUserLoggedIn && <div className="hideInMobile sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm">
        <div className="flex w-[200px] items-center justify-start pl-[20px]">
          Team
        </div>
        <div className="flex w-[200px] items-center justify-start">Name</div>
        <div className="flex w-[150px] items-center justify-start">
          Telegram
        </div>
        <div className="flex w-[330px] items-center justify-start pr-[20px]">
        What are you hoping to get out of this event?
        </div>
      </div>}
      {!isUserLoggedIn && <div className="hideInDesktop sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm">
        <div className="flex w-[200px] items-center justify-start pl-[20px]">
          Team
        </div>
      </div>}
      <style jsx>
        {
          `
          .hideInMobile { display: none;}
          .hideInDesktop {display: flex;}
          @media(min-width: 1024px) {
            .hideInMobile {display: flex}
            .hideInDesktop {display: none;}
          }
          
          
          `
        }
      </style>
    </>
};

export default TableHeader;

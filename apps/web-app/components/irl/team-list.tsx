import Link from "next/link";

const TeamList = (props: any) => {
  const items = props?.items ?? [];
  const onLogin = props.onLogin
  return <>
    <div className="flex w-[100%] h-fit flex-col pt-[8px] relative">
      {items.map((item, itemIndex) => (
        <div key={`${itemIndex}-event-list`} className="flex w-[100%] text-[13px] font-[400] py-[12px] border-b-[1px] border-b-[#CBD5E1]">
           <div className="flex w-full lg:w-[200px] items-center gap-[4px] justify-start pl-[20px]">
           <div className="bg-gray-200 h-[32px] w-[32px]">
           {item?.teamLogo && <img src={item.teamLogo}   className="bg-gray-200 h-[32px] w-[32px]"/>}
           </div>
             <Link href={`/teams/${item.teamUid}`}>
             <a target="_blank" className="text-clamp flex-1 break-words">{item.teamName}</a>
             </Link>
          </div>
          <div className="hidden lg:flex gap-[4px] w-[180px] items-center justify-start">
             <div className="bg-gray-200 h-[32px] w-[32px] rounded-[58px]"></div>
             <p className="">aaaaaa aaa</p>
          </div>
         
          <div className="hidden lg:flex w-[150px] items-center justify-start">
           @aaaaaaa
          </div>
          <div className="hidden lg:flex w-[330px] items-center justify-start pr-[20px]">
            aaaa aaaaaaa aaaaaaaa aaaaaaa aaaaaaa aaaa
          </div>
        </div>
      ))}
      
      <div className="bg-[#C8C8C8AB] hidden lg:block bg-opacity-60 backdrop-blur-[2.5px] absolute top-[4px] right-[1px] bottom-0 w-[calc(100%_-_200px)]">
        <div className="relative w-[100%] h-[100%] flex justify-center">
        <button onClick={onLogin} className="sticky top-[50%] h-[36px] rounded-[8px] flex items-center justify-center text-[14px] font-[500] bg-white cursor-pointer w-[156px]">Login To Access</button>
        </div>
      </div>
    </div>
    <style jsx>
      {
        `
        .text-clamp {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          overflow: hidden;
          -webkit-line-clamp: 2;
        }
        
        `
      }
    </style>
  </>
};

export default TeamList;

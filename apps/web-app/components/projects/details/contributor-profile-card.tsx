import { UserIcon } from '@heroicons/react/solid';
import { useRouter } from 'next/router';

export default function ContributorProfileCard({
  uid,
  name,
  url,
  role,
  teamName,
}) {
    const router = useRouter();
  return (
    <>
      <div className="absolute left-[-100%] bottom-[35px] mx-auto flex w-[295px] flex-col rounded-[12px] bg-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.14)]">
        <div className="h-[104px]">
          <div className=" bg-gradient-to-b--white-to-slate-200 top-[20px] flex h-[64px] w-full justify-center rounded-t-[12px] border-b border-[#E2E8F0]">
            <UserIcon className="relative top-[50%] inline-block h-[72px] w-[72px] rounded-full bg-gray-200 fill-white" />
          </div>
        </div>
        <div className="relative px-[20px] text-center text-lg font-semibold not-italic leading-7 text-[color:var(--neutral-slate-900,#0F172A)]">
          {name}
        </div>
        <div className="px-[20px] text-center text-sm font-medium not-italic leading-5 text-[#0F172A]">
          {teamName}
        </div>
        <div className="border-b border-[#E2E8F0] pb-[16px] text-center text-sm font-normal not-italic leading-5 text-[#0F172A]">
          {role}
        </div>
        <div className="py-[16px] px-[20px] ">
          <div className="flex h-[38px] cursor-pointer items-center justify-center rounded-[47px] bg-[#156FF7] text-center text-white"
          onClick={()=>{
            router.push('/members/'+uid);
          }}
          >
            View Profile
          </div>
        </div>
      </div>
    </>
  );
}

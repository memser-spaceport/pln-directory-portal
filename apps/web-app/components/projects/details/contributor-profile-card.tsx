import { UserIcon } from '@heroicons/react/solid';
import Image from 'next/image';
import { useRouter } from 'next/router';

export default function ContributorProfileCard({
  uid,
  name,
  url,
  role,
  teamName,
  isTeamLead = false
}) {
    // const router = useRouter();
  return (
    <>
      <div className="absolute left-[-100%] cursor-pointer bottom-[50px] mx-auto flex w-[295px] flex-col rounded-[12px] bg-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.14)] min-h-[189px]"
      onClick={() => {
        // router.push('/members/' + uid);
        window.open('/members/' + uid, '_blank');
      }}
      >
        <div className="h-[104px]">
          <div className=" bg-gradient-to-b--white-to-slate-200 top-[20px] flex h-[64px] w-full justify-center rounded-t-[12px] border-b border-[#E2E8F0]">
            {url && (
              <div className="relative top-[50%]">
                <Image
                  src={url}
                  alt="contributors image"
                  width={72}
                  height={72}
                  className="rounded-full"
                />
                {isTeamLead && (
                  <div className="absolute top-0 right-0">
                    <Image
                      src="/assets/images/icons/projects/team-lead.svg"
                      alt="team lead image"
                      width={20}
                      height={20}
                    />
                  </div>
                )}
              </div>
            )}
            {!url && (
              <UserIcon className="relative top-[50%] inline-block h-[72px] w-[72px] rounded-full bg-gray-200 fill-white" />
            )}
          </div>
        </div>
        <div className="relative px-[20px] text-center text-lg font-semibold not-italic leading-7 text-[color:var(--neutral-slate-900,#0F172A)] truncate" title={name}>
          {name}
        </div>
        <div className="px-[20px] text-center text-sm font-medium not-italic leading-5 text-[#0F172A]">
          {teamName}
        </div>
        <div className="border-[#E2E8F0] pb-[16px] text-center text-sm font-normal not-italic leading-5 text-[#0F172A]">
          {role}
        </div>
        {/* <div className="py-[16px] px-[20px] ">
          <div
            className="flex h-[38px] cursor-pointer items-center justify-center rounded-[47px] bg-[#156FF7] text-center text-white"
            onClick={() => {
              router.push('/members/' + uid);
            }}
          >
            View Profile
          </div>
        </div> */}
      </div>
    </>
  );
}

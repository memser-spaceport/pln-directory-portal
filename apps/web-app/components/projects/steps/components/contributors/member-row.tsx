import { UserIcon } from '@heroicons/react/solid';
import Image from 'next/image';

export default function MemberRow({
  data,
  onselect,
  onDeselect,
  defaultValue,
}) {
  const onSelect = (event) => {
    if (event.target.checked) {
      onselect(data);
    } else {
      onDeselect(data);
    }
  };

  const getSubtext = () => {
    return (
      (data?.mainTeam?.role ? data.mainTeam.role : 'Contributor') +
      (data.mainTeam ? ' at ' + data?.mainTeam?.team?.name : '')
    );
  };
  return (
    <>
      <div className="flex">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="cursor-pointer"
            onChange={onSelect}
            checked={defaultValue}
          />
          <div className="relative">
            {data.teamLead && (
              <div className="absolute right-[-8px] z-[1]">
                <Image
                  src="/assets/images/icons/projects/team-lead.svg"
                  alt="team lead image"
                  width={20}
                  height={20}
                  className=""
                />
              </div>
            )}
            {data.logo && (
              <Image
                src={data.logo}
                alt="tea image"
                width={40}
                height={40}
                className="relative shrink-0 rounded-full border border-[#E2E8F0]"
              />
            )}
            {!data.logo && (
              <UserIcon className="h-[40px] w-[40px] shrink-0 rounded-full bg-slate-100 fill-slate-200" />
            )}
          </div>
          <div className="text-blacknot-italic flex flex-col font-normal leading-5" title={data.teamLead ? 'Team Lead':''}>
            <div className=" text-[16px]">{data.name}</div>
            <div className="flex gap-3 text-sm font-normal not-italic leading-5 text-[#64748B]">
              {getSubtext()}
              {data?.teamMemberRoles?.length > 1 && (
                <div className="relative rounded-[24px]  bg-[#F1F5F9] px-[8px] py-[2px] ">
                  +{data?.teamMemberRoles?.length-1}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

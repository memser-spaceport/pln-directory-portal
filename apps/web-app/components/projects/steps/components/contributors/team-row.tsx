import { UserGroupIcon } from "@heroicons/react/solid";
import Image from "next/image";

export default function TeamRow({ onSelect, team }) {
    return (
      <>
        <div className="flex items-center justify-between self-stretch py-2.5 pr-3">
          <div className="flex items-center gap-2">
            {team.logo && (
              <Image
                src={team.logo}
                alt="tea image"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full border border-solid border-[#E2E8F0]"
              />
            )}
            {!team.logo && (
              <UserGroupIcon className="h-[40px] w-[40px] rounded-full bg-slate-100 fill-slate-200" />
            )}
            <div className="text-base font-normal not-italic leading-5 text-black">
              {team.name}
            </div>
          </div>
          <div>
            <div
              className={`flex cursor-pointer items-center  rounded border-solid px-3 py-1.5 
                    ${
                      team?.added
                        ? 'cursor-not-allowed '
                        : 'border border-[color:var(--primary-pl-blue,#156FF7)] '
                    }`}
              onClick={() => {
                if (!team?.added) {
                  onSelect(team);
                }
              }}
            >
              <div
                className={` text-sm font-normal not-italic leading-5 ${
                  team?.added
                    ? 'text-slate-600'
                    : 'text-[color:var(--primary-pl-blue,#156FF7)]'
                }`}
              >
                {!team?.added ? (
                  'Select'
                ) : (
                  <>
                    <span className="relative top-[3px]"><Image
                      src="/assets/images/icons/projects/added.svg"
                      alt="tea image"
                      className="relative top-[3px]"
                      width={16}
                      height={16}
                    /></span>
                    <span>Added</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
}
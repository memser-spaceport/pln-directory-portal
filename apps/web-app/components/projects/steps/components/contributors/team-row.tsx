import { UserGroupIcon } from "@heroicons/react/solid";
import Image from "next/image";

export default function TeamRow({ onSelect, team }) {
    return (
        <>
            <div className="flex justify-between items-center self-stretch pr-3 py-2.5">
                <div className="flex gap-2 items-center">
                    {
                        team.logo &&
                        <Image src={team.logo} alt="tea image" width={40} height={40}
                            className='w-10 h-10 shrink-0 rounded-full border border-[#E2E8F0] border-solid' />
                    }
                    {
                        !team.logo &&
                        <UserGroupIcon className="w-[40px] h-[40px] fill-slate-200 bg-slate-100 rounded-full" />
                    }
                    <div className="text-black text-base not-italic font-normal leading-5">
                        {team.name}
                    </div>
                </div>
                <div>
                    <div className="flex items-center rounded border border-[color:var(--primary-pl-blue,#156FF7)] px-3 py-1.5 border-solid cursor-pointer"
                        onClick={() => { onSelect(team) }}
                    >
                        <div className="text-[color:var(--primary-pl-blue,#156FF7)] text-sm not-italic font-normal leading-5">
                            Select
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
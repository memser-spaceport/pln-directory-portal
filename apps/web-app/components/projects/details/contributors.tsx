import { UserIcon } from "@heroicons/react/solid";
import Image from "next/image";

export default function Contributors() {
    return (
        <>
            <div className="flex flex-col gap-[10px] bg-white rounded-[12px] p-[16px]">
                <div className="text-[18px] font-semibold leading-[28px] pb-[14px] border-b border-[#E2E8F0]">
                    Contributors
                </div>
                <div className="flex gap-1">
                    <div>
                        <UserIcon className="bg-gray-200 fill-white relative inline-block h-[36px] w-[36px] rounded-full" />
                    </div>
                    <div>
                        <UserIcon className="bg-gray-200 fill-white relative inline-block h-[36px] w-[36px] rounded-full" />
                    </div>
                    <div>
                        <UserIcon className="bg-gray-200 fill-white relative inline-block h-[36px] w-[36px] rounded-full" />
                    </div>
                </div>
            </div>
        </>
    );
}
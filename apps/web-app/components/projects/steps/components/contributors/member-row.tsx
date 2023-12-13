import { UserIcon } from "@heroicons/react/solid";
import Image from "next/image";

export default function MemberRow({ data, onselect, onDeselect, defaultValue }) {

    const onSelect = (event) => {
        if (event.target.checked) {
            onselect(data);
        }else{
            onDeselect(data);
        }
    }
    return (
        <>
            <div className="flex">
                <div className="flex items-center gap-2">
                    <input type="checkbox" className="cursor-pointer" onChange={onSelect} checked={defaultValue}/>
                    {
                        data.logo &&
                        <Image src={data.logo} alt="tea image" width={40} height={40}
                            className='rounded-full border border-[#E2E8F0] shrink-0' />
                    }
                    {
                        !data.logo &&
                        <UserIcon className="w-[40px] h-[40px] fill-slate-200 bg-slate-100 rounded-full shrink-0" />
                    }
                    <div className="text-black text-base not-italic font-normal leading-5">{data.name}</div>
                </div>
            </div>
        </>
    );
}
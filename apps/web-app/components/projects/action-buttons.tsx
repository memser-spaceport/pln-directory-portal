import { useRouter } from "next/router"


export default function ActionButtons(){
    const router = useRouter();
    return (
        <>
            <div className="flex flex-row-reverse gap-[8px] py-[20px] font-[15px] font-semibold">
                <div className="px-[24px] py-[8px] rounded-[100px] border cursor-pointer border-[#156FF7] bg-[#156FF7] text-white">
                    Add Project
                </div>
                <div className="px-[24px] py-[8px] rounded-[100px] border border-[#156FF7]  text-[#156FF7] cursor-pointer"
                onClick={()=>{
                    router.push('/directory/projects')
                }}>
                    Cancel
                </div>
            </div>
        </>
    )
}
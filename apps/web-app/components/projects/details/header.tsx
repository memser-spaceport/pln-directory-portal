import Image from "next/image";

export default function Header() {
    return (
        <>
            <div className="flex gap-[16px]">
                <div>
                    <Image src="/assets/images/icons/projects/default.svg" alt="project image" width={100} height={108} />
                </div>
                <div className="flex flex-col gap-1">
                    <div className="text-[24px] font-bold">Connect Data</div>
                    <div className="text-[15px]">Host, manage and deploy web application with connect data</div>
                </div>
            </div>
        </>
    );
}
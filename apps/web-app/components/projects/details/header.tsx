import Image from "next/image";

export default function Header({project}) {
    return (
        <>
            <div className="flex gap-[16px]">
                <div>
                    <Image src={project.image} alt="project image" width={100} height={108} className="rounded"/>
                </div>
                <div className="flex flex-col gap-1 justify-center">
                    <div className="text-[24px] font-bold">{project.name}</div>
                    <div className="text-[15px]">{project.tagline}</div>
                </div>
            </div>
        </>
    );
}
import Image from "next/image";
import { ReactComponent as EditIcon } from '/public/assets/images/icons/edit.svg';
import { useRouter } from "next/router";

export default function Header({ project, userHasEditRights }) {
    const router = useRouter();

    return (
        <>
            <div className="flex justify-between">
                <div className="flex gap-[16px]">
                    <div>
                        <Image src={project.image} alt="project image" width={100} height={108} className="rounded" />
                    </div>
                    <div className="flex flex-col gap-1 justify-center">
                        <div className="text-[24px] font-bold">{project.name}</div>
                        <div className="text-[15px]">{project.tagline}</div>
                    </div>
                </div>
                {
                    userHasEditRights 
                    && 
                    <div className="flex text-base font-semibold text-[#156FF7] cursor-pointer"
                    onClick={() => {
                        
                        router.push('/directory/projects/edit/' + project.id)
                    }}
                >
                    <EditIcon className="m-1" />{' '}
                    Edit Project
                </div>
                }
                
            </div>
        </>
    );
}
import { useRouter } from 'next/router';
import { DirectoryCard } from '../shared/directory/directory-card/directory-card';
import Image from 'next/image';
import { UserGroupIcon } from '@heroicons/react/solid';

export function ProjectCard({ project, isGrid = true }) {
    const router = useRouter();

    const backLink = encodeURIComponent(router.asPath);

    const onProjectClicked = () => {
        console.log('Clicked');
    }

    return (
        <DirectoryCard
            isGrid={isGrid}
            cardUrl={`/directory/projects/${project.id}?backLink=${backLink}`}
            handleOnClick={onProjectClicked}
            type="projects"
        >
            <div className={`${isGrid ? 'p-[24px]' : ''} w-full`}>
                <div className='flex flex-col'>
                    <div className='flex justify-between'>
                        <div className='flex'>
                            <Image src={project.image} alt="project image" width={41} height={41} />
                            <div className='pl-2 my-auto font-semibold text-[16px]'>{project.name}</div>
                        </div>
                        {
                            project.fundingNeeded && <div className='my-auto px-[8px] py-[3px] bg-[#FFEAC1] rounded-[24px]'>
                                <Image src={'/assets/images/icons/projects/funding.svg'} alt="project image" width={12} height={12} />
                            </div>
                        }
                    </div>
                    <div className='py-[20px] text-left text-[16px]'>
                        <div>{project.description}</div>
                    </div>
                    <div className={`flex ${isGrid?'pb-[20px] border-b':''}`}>
                        <div>
                            {
                                project.contributingTeamImage === 'default'
                                    ? <UserGroupIcon className="bg-gray-200 fill-white relative inline-block h-6 w-6 rounded-full" />
                                    : <Image src={project.contributingTeamImage} alt="project image" width={35} height={35} />
                            }
                        </div>
                        <div className='font-[13px] font-medium pl-2 my-auto'>{project.contributingTeamName}</div>
                    </div>
                    {
                        isGrid && <div className='pt-[20px] mx-auto'>
                            <div className='border w-max px-[23px] py-[8px] border-[#156FF7] rounded-[47px] font-medium text-[14px] text-[#156FF7] cursor-pointer'>
                                View Project
                            </div>
                        </div>
                    }

                </div>
            </div>
        </DirectoryCard>
    );
}

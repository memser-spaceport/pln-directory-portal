import { useRouter } from 'next/router';
import { DirectoryCard } from '../shared/directory/directory-card/directory-card';
import Image from 'next/image';
import { UserGroupIcon } from '@heroicons/react/solid';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

export function ProjectCard({ project, isGrid = true }) {
    const router = useRouter();
    const analytics = useAppAnalytics();

    const backLink = encodeURIComponent(router.asPath);

    const onProjectClicked = () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_CLICKED, {
          projectUid: project.id,
          projectName: project.name,
          from: 'project-list'
        });
      }

    return (
        <DirectoryCard
            isGrid={isGrid}
            cardUrl={`/projects/${project.id}?backLink=${backLink}`}
            handleOnClick={onProjectClicked}
            type="projects"
        >
            <div className={`${isGrid ? 'p-[24px] h-[228px]' : ''} w-full`}>
                <div className='flex flex-col'>
                    <div className='flex justify-between'>
                        <div className='flex'>
                            <div className='relative min-w-[41px]! min-h-[41px]!'>
                                <Image src={project.image} alt="project image" width={41} height={41} className='rounded min-w-[41px]! min-h-[41px]!'/>
                                {/* <img src={project.image} alt="project image" className='rounded'/> */}
                                </div>
                            <div className={`pl-2 my-auto font-semibold text-[16px] text-left ${isGrid?'max-w-[205px]':''} youtube-title`}>{project.name}</div>
                        </div>
                        {
                            //className='my-auto px-[8px] py-[3px] bg-[#FFEAC1] rounded-[24px]'
                            project.fundingNeeded && <div className="flex" title='Raising Funds'>
                                <Image src={'/assets/images/icons/projects/funding-with-bg.svg'} alt="project image" width={24} height={24} />
                            </div>
                        }
                    </div>
                    <div className={`py-[20px] text-left text-[16px] ${isGrid ? 'h-[100px]' : ''}`}>
                        <div className='project-tagline'>{project.tagline}</div>
                    </div>
                    <div className={`flex ${isGrid?'pb-[20px]':''}`}>
                    {/* <div className={`flex`}> */}
                        <div>
                            {
                                project.maintainingTeamImage === 'default'
                                    ? <UserGroupIcon className="bg-gray-200 fill-white relative inline-block h-6 w-6 rounded-full" />
                                    : <Image src={project.maintainingTeamImage} alt="project image" width={36} height={36} className='rounded'/>
                            }
                        </div>
                        <div className='font-[13px] font-normal pl-2 text-left'>
                            <div className='max-w-[200px] truncate'>
                            {project.maintainingTeamName}
                            </div>
                            <div className='opacity-40'>Maintainer</div>
                        </div>
                    </div>
                    {/* {
                        isGrid && <div className='pt-[20px] mx-auto'>
                            <div className='border w-max px-[23px] py-[8px] border-[#156FF7] rounded-[47px] font-medium text-[14px] text-[#156FF7] cursor-pointer'>
                                View Project
                            </div>
                        </div>
                    } */}

                </div>
            </div>
        </DirectoryCard>
    );
}
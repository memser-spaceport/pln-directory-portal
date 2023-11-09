import Image from "next/image";
import { DirectoryList } from "../shared/directory/directory-list/directory-list";
import { ProjectCard } from "./project-card";
import { useRouter } from "next/router";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";

export function ProjectList({
  projects,
  isGrid,
  filterProperties,
  isUserLoggedIn
}) {

  const { push } = useRouter();
  const analytics = useAppAnalytics();

  return (
    <DirectoryList
      filterProperties={filterProperties}
      itemsCount={projects ? projects.length : 0}
    >
      {
        isUserLoggedIn &&
        <div className={`${isGrid ? 'w-[295px] h-[228px]' : 'w-full h-[100px]'}  relative cursor-pointer border-dashed border rounded-[8px] border-[#156FF7] p-[24px] flex items-center justify-center`}
          onClick={() => {
            analytics.captureEvent(
              APP_ANALYTICS_EVENTS.PROJECT_ADD_CLICKED,
              {
                from: 'list'
              }
            );
            push('/directory/projects/add');
          }}
        >
          {/* <Image
       src={'/assets/images/icons/projects/add-new.svg'} alt="project image" width={295} height={228} /> */}
          <div className="flex items-center flex-col gap-1">
            <Image
              src={'/assets/images/icons/projects/add-new.svg'} alt="project image" width={20} height={20} />
            <div className="text-[#156FF7] text-[16px] font-medium">Add Project</div>
            <div className="text-[#64748B] text-[14px] font-normal">List your project here</div>
          </div>
        </div>
      }
      {projects && projects.map((project) => {
        return <ProjectCard project={project} isGrid={isGrid} key={project.id} />
      })}
    </DirectoryList>
  );
}

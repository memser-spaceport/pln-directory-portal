import Image from "next/image";
import { DirectoryList } from "../shared/directory/directory-list/directory-list";
import { ProjectCard } from "./project-card";
import { useRouter } from "next/router";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS, PAGE_ROUTES } from "apps/web-app/constants";

export function ProjectList({
  projects,
  isGrid,
  filterProperties,
  isUserLoggedIn
}) {

  const { push } = useRouter();
  const analytics = useAppAnalytics();

  const onAddProjectClicked = () => {

      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.PROJECT_ADD_CLICKED,
        {
          from: 'list'
        }
      );
      push('/projects/add');
  }

  return (
    <DirectoryList
    from={PAGE_ROUTES.PROJECTS}
      filterProperties={filterProperties}
      callback={onAddProjectClicked}
      itemsCount={projects ? projects.length : 0}
    >
      {
        isUserLoggedIn && projects?.length > 0 &&
        <div className={`${isGrid ? 'w-[295px] h-[228px]' : 'w-full h-[100px]'}  relative cursor-pointer border-dashed border rounded-[8px] border-[#156FF7] p-[24px] flex items-center justify-center`}
          onClick={onAddProjectClicked}
        >
          {/* <Image
       src={'/assets/images/icons/projects/add-new.svg'} alt="project image" width={295} height={228} /> */}
          <div className="flex items-center flex-col gap-1">
            <Image
              src={'/assets/images/icons/projects/add-new.svg'} alt="project image" width={16} height={16} />
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

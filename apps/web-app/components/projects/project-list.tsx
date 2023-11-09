import Image from "next/image";
import { DirectoryList } from "../shared/directory/directory-list/directory-list";
import { ProjectCard } from "./project-card";
import { useRouter } from "next/router";

export function ProjectList({
  projects,
  isGrid,
  filterProperties,
  isUserLoggedIn
}) {

  const { push } = useRouter();

  return (
    <DirectoryList
      filterProperties={filterProperties}
      itemsCount={projects? projects.length : 0}
    >
      {
        isUserLoggedIn && 
        <div className="w-[295px] h-[228px] relative cursor-pointer"
          onClick={() => {
            push('/directory/projects/add');
          }}
        >
      <Image
       src={'/assets/images/icons/projects/add-new.svg'} alt="project image" width={295} height={228} />
      </div>
      }
      {projects && projects.map((project) => {
        return <ProjectCard project={project} isGrid={isGrid} key={project.id}/>
      })}
    </DirectoryList>
  );
}

import { DirectoryList } from "../shared/directory/directory-list/directory-list";
import { ProjectCard } from "./project-card";

export function ProjectList({
  projects,
  isGrid,
  filterProperties,
}) {
  return (
    <DirectoryList
      filterProperties={filterProperties}
      itemsCount={projects? projects.length : 0}
    >
      {projects && projects.map((project) => {
        return <ProjectCard project={project} isGrid={isGrid} key={project.id}/>
      })}
    </DirectoryList>
  );
}

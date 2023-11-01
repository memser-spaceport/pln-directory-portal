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
      itemsCount={projects.length}
    >
      {projects.map((project) => {
        return <ProjectCard project={project} isGrid={isGrid} key={project.id}/>
      })}
    </DirectoryList>
  );
}

import { useState } from 'react';
import { useRouter } from 'next/router';
import { MemberProfileProjectsProps } from '../../../../utils/members.types';
import { ProfileProjectCard } from '../../../shared/profile/profile-cards/profile-project-card';
import { ReactComponent as project_icon } from '../../../../public/assets/images/icons/project_icon.svg';
import { MemberProfileProjectsModal } from './member-projects-modal';

export function MemberProfileProjects({
  pinnedRepositories,
  allRepositories,
}: MemberProfileProjectsProps) {
  const {
    query: { id },
  } = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const repositories =
    pinnedRepositories.length > 0
      ? pinnedRepositories
      : allRepositories.slice(0, 3);
  return (
    <>
      <h3 className="mb-2 mt-6 font-medium text-slate-500">
        {'Projects'} ({allRepositories?.length})
        {allRepositories?.length > 0 && (
          <span
            onClick={() => setIsModalOpen(true)}
            className="float-right cursor-pointer text-blue-500"
          >
            see all
          </span>
        )}
      </h3>
      <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
        {repositories.map((project, i) => {
          return (
            <ProfileProjectCard
              key={`${id}.${project.name}`}
              url={project.url}
              // imageUrl={project?.url}
              avatarIcon={project_icon}
              name={project.name}
              description={project.description}
            />
          );
        })}
      </div>
      <MemberProfileProjectsModal
        isOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        pinnedRepositories={pinnedRepositories}
        allRepositories={allRepositories}
      />
    </>
  );
}

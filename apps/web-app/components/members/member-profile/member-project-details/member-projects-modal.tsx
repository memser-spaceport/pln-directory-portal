import { useRouter } from 'next/router';
import { MemberProfileProjectsProps, IGitRepositories } from '../../../../utils/members.types';
import { ProfileProjectCard } from '../../../shared/profile/profile-cards/profile-project-card';
import { ReactComponent as project_icon } from '../../../../public/assets/images/icons/project_icon.svg';
import Modal from '../../../../components/layout/navbar/modal/modal';
import { Dispatch, SetStateAction } from 'react';

interface MemberProfileProjectsModalProps extends MemberProfileProjectsProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  onItemClick: (project: IGitRepositories) => void;
}

export function MemberProfileProjectsModal({
  isOpen,
  setIsModalOpen,
  repositories,
  onItemClick,
}: MemberProfileProjectsModalProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsModalOpen(false)}
    >
      <div className="pt-8 slim-scroll w-[500px]">
        <div className="px-8 mb-4 font-bold text-slate-900">
          {'Repositories'} ({repositories?.length})
        </div>
        <div className="px-8 rounded-xl github-project-popup overflow-y-auto">
          {repositories?.map((project, i) => {
            return (
              <ProfileProjectCard
                key={`popup ${id}.${project.name}`}
                url={project.url}
                // imageUrl={project?.url}
                avatarIcon={project_icon}
                name={project.name}
                description={project.description}
                clickHandler={() => onItemClick(project)}
              />
            );
          })}
        </div>
        <div className="p-4 border-t-2 w-full">
          <div className="flex place-content-end  ">
            <button
              className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-[90px] w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8] disabled:bg-slate-400"
              onClick={() => setIsModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
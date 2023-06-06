import { useRouter } from 'next/router';
import { MemberProfileProjectsProps } from '../../../../utils/members.types';
import { ProfileProjectCard } from '../../../shared/profile/profile-cards/profile-project-card';
import { ReactComponent as project_icon } from '../../../../public/assets/images/icons/project_icon.svg';
import Modal from '../../../../components/layout/navbar/modal/modal';
import { Dispatch, SetStateAction } from 'react';

interface MemberProfileProjectsModalProps extends MemberProfileProjectsProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function MemberProfileProjectsModal({
  isOpen,
  setIsModalOpen,
  repositories,
}: MemberProfileProjectsModalProps) {
  const {
    query: { id },
  } = useRouter();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsModalOpen(false)}
      enableFooter={false}
      enableHeader={false}
    >
      <div className="p-8">
        <div className="mb-4 mt-6 font-bold text-slate-900">
          {'Projects'} ({repositories?.length})
        </div>
        <div className="mb-3 rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none github-project-popup overflow-y-auto">
          {repositories?.map((project, i) => {
            return (
              <ProfileProjectCard
                key={`popup ${id}.${project.name}`}
                url={project.url}
                // imageUrl={project?.url}
                avatarIcon={project_icon}
                name={project.name}
                description={project.description}
              />
            );
          })}
        </div>
        <div className="pt-[20px] border-t-2 w-full">
          <div className="flex place-content-center">
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

import Modal from "apps/web-app/components/layout/navbar/modal/modal";
import TeamProfileProjectCard from "./team-profile-project-card";


export function TeamProfileProjectsModal({
  isOpen,
  setIsModalOpen,
  projects,
  hasProjectsEditAccess=false
}) {
//   const {
//     query: { id },
//   } = useRouter();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsModalOpen(false)}
      enableFooter={false}
      enableHeader={false}
    >
      <div className="pt-8 slim-scroll">
        <div className="px-8 mb-4 font-bold text-slate-900">
          {'Projects'} ({projects?.length})
        </div>
        <div className="px-8 rounded-xl github-project-popup overflow-y-auto">
          {projects?.map((project, i) => {
            return (
              <> {!project?.isDeleted && <TeamProfileProjectCard key={project.id} project={project} hasProjectsEditAccess={hasProjectsEditAccess}/>} </>
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

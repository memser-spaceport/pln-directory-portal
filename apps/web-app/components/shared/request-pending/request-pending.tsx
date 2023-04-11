import { Dispatch, SetStateAction } from 'react';
import Modal from '../../layout/navbar/modal/modal';

interface RequestPendingModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function RequestPending({
  isOpen,
  setIsModalOpen,
}: RequestPendingModalProps) {
  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsModalOpen(false)}
        enableHeader={false}
        enableFooter={false}
      >
        <div className="p-5">
          <div className="mb-3 text-center text-xl font-bold">
            You already have a request awaiting for approval. Please wait until
            it&apos;s processed.
          </div>
          <div className="text-center">
            <button
              className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus mb-5 inline-flex rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]"
              onClick={() => setIsModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

import React from 'react';
import Modal from '../modal/modal';

interface DeleteModalProps {
  setOpenModal: (e: boolean) => void;
  onRemoveClickHandler: (e: any) => void;
  rejectId: any[];
}

const DeleteModal = ({ setOpenModal, onRemoveClickHandler, rejectId }: DeleteModalProps) => {
  const onClose = () => {
    setOpenModal(false);
  };
  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="relative min-h-[21vh] w-[640px] rounded-[8px] bg-white text-[#000000]">
        <div className="absolute top-[10px] right-[10px]">
          <button onClick={onClose}>
            <img alt="close" src="/assets/images/close_gray.svg" height={20} width={20} />
          </button>
        </div>
        <div className="flex flex-col justify-between p-[30px] ">
          <div className="py-[10px] text-left text-2xl font-extrabold leading-8">Are you sure you want to reject?</div>
          <div className="text-left text-sm font-normal leading-5">
            Clicking reject will remove the member from the list.
          </div>

          <div className="mt-[25px] flex justify-end gap-[8px]">
            <button
              onClick={onClose}
              className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[18px] py-[10px] text-[13px] font-[400]`}
            >
              Cancel
            </button>

            <button
              className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] bg-[#DD2C5A] px-[18px] py-[10px] text-[13px] font-[400] text-white`}
              onClick={() => onRemoveClickHandler(rejectId)}
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteModal;

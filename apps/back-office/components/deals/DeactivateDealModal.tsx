import React from 'react';
import Modal from '../modal/modal';

interface DeactivateDealModalProps {
  isOpen: boolean;
  dealName: string;
  onConfirm: () => void;
  onClose: () => void;
}

const DeactivateDealModal = ({ isOpen, dealName, onConfirm, onClose }: DeactivateDealModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="relative w-[520px] rounded-[12px] bg-white p-6">
        <button
          className="absolute right-[16px] top-[16px] flex items-center justify-center"
          onClick={onClose}
          aria-label="Close"
        >
          <img alt="close" src="/assets/images/close_gray.svg" height={20} width={20} />
        </button>

        <div className="flex flex-col items-center gap-[16px]">
          <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#FEE2E2]">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M28 6H4C3.46957 6 2.96086 6.21071 2.58579 6.58579C2.21071 6.96086 2 7.46957 2 8V11C2 11.5304 2.21071 12.0391 2.58579 12.4142C2.96086 12.7893 3.46957 13 4 13V24C4 24.5304 4.21071 25.0391 4.58579 25.4142C4.96086 25.7893 5.46957 26 6 26H26C26.5304 26 27.0391 25.7893 27.4142 25.4142C27.7893 25.0391 28 24.5304 28 24V13C28.5304 13 29.0391 12.7893 29.4142 12.4142C29.7893 12.0391 30 11.5304 30 11V8C30 7.46957 29.7893 6.96086 29.4142 6.58579C29.0391 6.21071 28.5304 6 28 6ZM19 18H13C12.7348 18 12.4804 17.8946 12.2929 17.7071C12.1054 17.5196 12 17.2652 12 17C12 16.7348 12.1054 16.4804 12.2929 16.2929C12.4804 16.1054 12.7348 16 13 16H19C19.2652 16 19.5196 16.1054 19.7071 16.2929C19.8946 16.4804 20 16.7348 20 17C20 17.2652 19.8946 17.5196 19.7071 17.7071C19.5196 17.8946 19.2652 18 19 18ZM28 11H4V8H28V11Z"
                fill="#D21A0E"
              />
            </svg>
          </div>

          <div className="text-center text-[20px] font-semibold leading-[28px] text-[#0F172A]">
            Deactivate {dealName} deal?
          </div>

          <div className="text-center text-[14px] leading-[22px] text-[#64748B]">
            The deal will be removed from the catalog. Founders can no longer see or claim it. You can restore it at any
            time — archiving is non-destructive.
          </div>

          <div className="mt-[8px] flex w-full gap-[12px]">
            <button
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-[8px] border border-[#CBD5E1] px-[18px] py-[10px] text-[14px] font-[500] text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center rounded-[8px] bg-[#EF4444] px-[18px] py-[10px] text-[14px] font-[500] text-white hover:bg-[#DC2626]"
            >
              Deactivate Deal
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeactivateDealModal;

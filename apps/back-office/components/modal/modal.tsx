import { Dialog, Transition } from '@headlessui/react';
import React, { ReactNode, Fragment, LegacyRef } from 'react';

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  image?: ReactNode;
  headerStyleClass?: string;
  enableHeader?: boolean;
  enableFooter?: boolean;
  modalClassName?: string;
  modalRef?: LegacyRef<HTMLDivElement>;
};

type ModalHeaderProps = {
  title?: string;
  onClose: () => void;
  image?: ReactNode;
  headerStyleClass?: string;
};

function ModalHeader({
  title,
  headerStyleClass,
  image,
  onClose,
}: ModalHeaderProps) {
  return (
    <>
      <img
        className="stroke-3 absolute right-5 top-5 z-40 cursor-pointer bg-red"
        onClick={() => onClose()}
        src='/assets/images/minus_white.svg'
      />
      <div className={`${headerStyleClass} rounded-lg`}>
        {image && (
          <div className="flex h-40 rounded-tr-lg rounded-tl-lg bg-[url('/assets/images/Banner.svg')]">
            <div className="my-auto ml-5">{image}</div>
          </div>
        )}
        {title && (
          <Dialog.Title
            as="h3"
            className="text-lg font-medium leading-6 text-gray-900"
          >
            {title}
          </Dialog.Title>
        )}
      </div>
    </>
  );
}

function ModalFooter({ onClose }: ModalHeaderProps) {
  return (
    <div className="absolute bottom-2 m-3">
      <div className="ml-2">
        <button
          className="on-focus leading-3.5 text-md mb-2 mr-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
          onClick={() => onClose()}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Modal({
  isOpen,
  children,
  onClose,
  modalRef
}: ModalProps) {

  return (
    <>
      <Transition show={isOpen} as={Fragment}>
        <Dialog open={isOpen} onClose={onClose} ref={modalRef} className="relative z-50">
          {/* The backdrop, rendered as a fixed sibling to the panel container */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </Transition.Child>

          {/* Full-screen scrollable container */}
          <div className="fixed inset-0 w-screen overflow-y-auto">
            {/* Container to center the panel */}
            <div className="flex min-h-full items-center justify-center p-4">
              {/* The actual dialog panel  */}
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="mx-auto rounded-lg bg-white">
                  <div>{children}</div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

export default Modal;
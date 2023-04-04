import Image from 'next/image';
import { Dialog, Transition } from '@headlessui/react';
import { XIcon as CloseIcon } from '@heroicons/react/outline';
import React, { ReactNode, Fragment } from 'react';

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  image: string;
  headerStyleClass?: string;
  enableHeader?: boolean;
  enableFooter?: boolean;
};

type ModalHeaderProps = {
  title?: string;
  onClose: () => void;
  image?: string;
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
      <CloseIcon
        className="stroke-3 absolute top-5 right-5 z-40 h-6 w-6 cursor-pointer text-white"
        onClick={() => onClose()}
      />
      <div className={headerStyleClass}>
        {image && (
          <div className="relative h-40">
            <Image alt={`${title} img`} src={image} layout="fill" />
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
          className="on-focus leading-3.5 text-md mr-2 mb-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
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
  title,
  children,
  image,
  onClose,
  enableHeader = true,
  enableFooter = true,
}: ModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 top-0 left-0 z-[1055] w-full grow overflow-x-hidden outline-none"
        onClose={() => onClose()}
      >
        <div className="h-full px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="my-8 inline-block h-auto min-h-full w-[35%] transform rounded-lg bg-white text-left align-middle shadow-xl transition-all">
              {enableHeader && (
                <ModalHeader
                  onClose={onClose}
                  title={title}
                  image={image}
                  headerStyleClass="h-10"
                />
              )}
              <div className="mt-40">{children}</div>
              {enableFooter && <ModalFooter onClose={onClose} />}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

export default Modal;

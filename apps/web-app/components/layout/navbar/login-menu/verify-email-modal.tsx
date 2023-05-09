import { XCircleIcon } from '@heroicons/react/solid';
import { Dispatch, Fragment, SetStateAction } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ReactComponent as FailedIcon } from '../../../../public/assets/images/icons/danger.svg';
import { authenticate } from 'apps/web-app/utils/services/auth';
interface IVerifyEmailModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function VerifyEmailModal({
  isOpen,
  setIsModalOpen,
}: IVerifyEmailModalProps) {
  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed relative inset-0 left-0 top-0 z-[1000] w-full grow overflow-x-hidden outline-none"
          onClose={handleModalClose}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative w-full max-w-2xl transform rounded-md bg-white p-8 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h2"
                    className="text-2xl flex font-bold leading-6"
                  >
                    <FailedIcon />
                    <p className="my-auto ml-2">Verify Membership</p>
                  </Dialog.Title>
                  <div className="text-sm/5 mt-3">
                    Email doesn't match a membership email in the directory.
                    Please contact our support at{' '}
                    <span className="font-bold"> supportmail@protocol.ai </span>{' '}
                    for assistance or try to{' '}
                    <span
                      onClick={authenticate}
                      className="cursor-pointer font-bold italic underline"
                    >
                      {' '}
                      log in
                    </span>
                    {' '} again.
                  </div>
                  <div className="w-100 mt-6 flex justify-end">
                    <button
                      type="button"
                      className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-1/4 justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2"
                      onClick={handleModalClose}
                    >
                      Close
                    </button>
                  </div>
                  <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-white" />
                  <XCircleIcon
                    onClick={handleModalClose}
                    data-testid={'close-icon'}
                    className={
                      'absolute -top-4 -right-4 h-8 w-8 text-slate-600'
                    }
                  />
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

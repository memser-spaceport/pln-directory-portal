import { Transition, Dialog } from '@headlessui/react';
import { INVITE_ONLY_RESTRICTION_ERRORS } from 'apps/web-app/constants';
import { Fragment } from 'react';

interface IIrlInviteOnlyRestrict {
  isOpen: boolean;
  onClose: () => void;
  restrictionReason: string;
}

export function IrlInviteOnlyRestrict(props: IIrlInviteOnlyRestrict) {
  //props
  const isOpen = props.isOpen;
  const onClose = props.onClose;
  const restrictionReason = props.restrictionReason;

  //variable
  const isUnauthorized =
    restrictionReason === INVITE_ONLY_RESTRICTION_ERRORS.UNAUTHORIZED;

  //methods
  const handleModalClose = () => {
    onClose();
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative inset-0 left-0 top-0 z-[1058] w-full grow overflow-x-hidden outline-none"
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
                <Dialog.Panel className="relative w-full max-w-2xl transform rounded-xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <img
                    className="absolute right-4 top-4 z-40 cursor-pointer"
                    src="/assets/images/icons/close_gray.svg"
                    alt="close"
                    onClick={handleModalClose}
                  />
                  <Dialog.Title as="h2" className="text-2xl font-bold">
                    <p className="">
                      {isUnauthorized ? 'Access Restricted' : 'Login to view'}
                    </p>
                  </Dialog.Title>
                  {
                    <>
                      {isUnauthorized ? (
                        <div className="mt-5 py-2 px-3 flex items-center gap-[10px] rounded-[4px] bg-[#DD2C5A] bg-opacity-10 text-[#0F172A]">
                          <img
                            src="/assets/images/icons/info-red.svg"
                            alt="info"
                          />
                          <span className=" ">
                            You do not have access to this event.
                          </span>
                        </div>
                      ) : (
                        <p className="mt-[20px]">
                          Please login to access this event.
                        </p>
                      )}

                      <div className="mt-4 w-full md:float-right md:w-auto ">
                        <button
                          className={
                            'w-full rounded-lg border border-[#CBD5E1] bg-[#156FF7] py-[10px] px-6 text-sm font-medium text-[#ffffff] shadow-md outline-none md:w-auto'
                          }
                          onClick={() => {
                            handleModalClose();
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </>
                  }
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

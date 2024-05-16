import { Transition, Dialog } from '@headlessui/react';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { authenticate } from 'apps/web-app/utils/services/auth';
import { useRouter } from 'next/router';
import { Fragment } from 'react';

interface IIrlInviteOnlyLoggedOut {
  isOpen: boolean;
  onClose: () => void;
}

export function IrlInviteOnlyLoggedOut(props: IIrlInviteOnlyLoggedOut) {
  //props
  const isOpen = props.isOpen;
  const onClose = props.onClose;

  //variables
  const analytics = useAppAnalytics();
  const router = useRouter();

  //methods
  const handleModalClose = () => {
    onClose();
  };

  const handleLoginClick = () => {
    onClose();
    authenticate(router.asPath);
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_INVITE_ONLY_RESTRICTION_POPUP_LOGIN_CLICKED);
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
                    <p className="text-[#0F172A]">Login to view</p>
                  </Dialog.Title>
                  {
                    <>
                      <p className="mt-[18px] text-[#0F172A]">
                        Please login to access this event.
                      </p>

                      <div className="w-full mt-4 flex gap-[10px] justify-end">
                        <div>
                          <button
                            className={
                              'rounded-lg border border-[#CBD5E1] py-[10px] px-6 text-sm font-medium text-[#0F172A] shadow-md outline-none md:w-auto'
                            }
                            onClick={() => {
                              handleModalClose();
                            }}
                          >
                            Close
                          </button>
                        </div>
                        <div>
                          <button
                            className={
                              'rounded-lg border border-[#CBD5E1] bg-[#156FF7] py-[10px] px-6 text-sm font-medium text-[#ffffff] shadow-md outline-none md:w-auto'
                            }
                            onClick={() => {
                              handleLoginClick();
                            }}
                          >
                            Proceed to login
                          </button>
                        </div>
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

import Modal from "apps/web-app/components/layout/navbar/modal/modal";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";


export function DeleteConfirmationModal({
    isOpen,
    onYes,
    setIsModalOpen
}) {
    const analytics = useAppAnalytics();


    const onAction = (flag) => {
        if (flag) {
            analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_DETAIL_DELETE_YES_CLICKED
            );
            onYes();
        } else {
            analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_DETAIL_DELETE_NO_CLICKED
            );
            setIsModalOpen(false);
        }
    }

    return (
        <>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog
                    as="div"
                    className="fixed relative inset-0 left-0 top-0 z-[1000] w-full grow overflow-x-hidden outline-none"
                    onClose={() => onAction}
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
                                        className="text-xl font-bold leading-6"
                                    >
                                        <p className="mt-4"> { "Confirm Delete"}</p>
                                    </Dialog.Title>
                                    {
                                        (<>
                                            <p className="mt-[20px] mb-[20px]">
                                               Are you sure you want to delete the project?
                                            </p>

                                            <div className="float-right">
                                                <button className={'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus w-[150px] justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8] mr-4'}

                                                    onClick={() => { onAction(true) }}
                                                >
                                                    YES
                                                </button>

                                                <button className={'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus w-[150px] justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]'}
                                                    onClick={() => { onAction(false) }}
                                                >
                                                    NO
                                                </button>
                                            </div>
                                        </>)
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

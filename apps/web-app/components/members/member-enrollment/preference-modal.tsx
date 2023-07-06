import { Transition, Dialog } from "@headlessui/react";
import { XCircleIcon } from "@heroicons/react/solid";
import { Fragment } from "react";
import { SETTINGS_CONSTANTS } from "apps/web-app/constants";

export function PreferenceModal({
    isOpen,
    onCloseFn,
    children
}) {

    const handleModalClose = () => {
        onCloseFn(false);
    };
    return (
        <>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog
                    as="div"
                    className="fixed relative inset-0 left-0 top-0 z-[1058] w-full grow overflow-x-hidden outline-none"
                    onClose={() => onCloseFn}
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
                                        <p className="mt-4">{SETTINGS_CONSTANTS.USER_PREF}</p>
                                    </Dialog.Title>
                                    {
                                        (<>
                                            {children}
                                        </>)
                                    }
                                    <XCircleIcon
                                        onClick={handleModalClose}
                                        data-testid={'close-icon'}
                                        className={
                                            'absolute -top-4 -right-4 h-8 w-8 text-slate-600 cursor-pointer'
                                        }
                                    />
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    )
}
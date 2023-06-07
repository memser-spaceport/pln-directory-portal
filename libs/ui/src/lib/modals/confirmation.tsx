import { Transition, Dialog } from "@headlessui/react";
// import { XCircleIcon } from "@heroicons/react/solid";
import { Fragment } from "react";

interface IDiscardChangesPopupProps {
    text: string;
    isOpen: boolean;
    onCloseFn: (flag:boolean) => void;
}

export function DiscardChangesPopup({
    text,
    isOpen,
    onCloseFn
}:IDiscardChangesPopupProps) {

    const handleModalClose = (flag:boolean) => {
        onCloseFn(flag);
      };
    return (
        <>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog
                    as="div"
                    className="fixed relative inset-0 left-0 top-0 z-[1000] w-full grow overflow-x-hidden outline-none"
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
                                        <p className="mt-4">Discard Changes</p>
                                    </Dialog.Title>
                                    {
                                        (<>
                                            <p className="mt-[20px] mb-[20px]">
                                               {text}
                                            </p>

                                            <div>
                                                <button className={'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus float-right inline-flex w-[150px] justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]'}

                                                    onClick={() => { handleModalClose(true) }}
                                                >
                                                    YES
                                                </button>

                                                <button className={'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-[150px] justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]'}
                                                    onClick={() => { handleModalClose(false) }}
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
    )
}
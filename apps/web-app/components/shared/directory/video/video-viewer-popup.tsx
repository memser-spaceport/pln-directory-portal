import { XCircleIcon } from '@heroicons/react/solid';
import { Dispatch, Fragment, SetStateAction } from 'react';
import { Dialog, Transition } from '@headlessui/react';
interface IValidationErrorMessages {
  isOpen: boolean;
  handleClose: Dispatch<SetStateAction<boolean>>;
}

export function YoutubeVideoPlayer({
  isOpen,
  handleClose,
}: IValidationErrorMessages) {
  const handleModalClose = () => {
    handleClose(false);
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed relative inset-0 left-0 top-0 z-[10000] w-full grow overflow-x-hidden outline-none"
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
                <Dialog.Panel className="relative w-full max-w-2xl transform rounded-md bg-transparent text-left align-middle   transition-all">
                  
                  <iframe width="672" height="400" src="https://www.youtube.com/embed/r-nU_MI2lV4" title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>
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
  );
}

import { XCircleIcon } from '@heroicons/react/solid';
import { Dispatch, Fragment, SetStateAction } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ReactComponent as FailedIcon } from '../../../public/assets/images/icons/danger.svg';
interface IValidationErrorMessages {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  errors: any,
  from:string
}

export function ValidationErrorMessages({
  isOpen,
  setIsModalOpen,
  errors,
  from
}: IValidationErrorMessages) {
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
                    className="text-2xl font-bold leading-6"
                  >
                    <FailedIcon />
                    <p className="mt-4">Validation Error</p>
                  </Dialog.Title>
                 {
                  from === 'member' ? (<>
                   { errors?.basic?.length>0 && <div className="w-full text-base mt-2 font-semibold"> Basic </div>}
                    <div className="w-full rounded-lg bg-white px-5 py-2">
                      <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                        {errors?.basic?.map((item, index) => (
                        <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  { errors?.skills?.length > 0 &&  <div className="w-full text-base mt-2 font-semibold"> Skills </div>}
                  <div className="w-full rounded-lg bg-white px-5 py-2">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors?.skills?.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  </>):(<>
                    { errors?.basic?.length>0 && <div className="w-full text-base mt-2 font-semibold"> Basic </div>}
                    <div className="w-full rounded-lg bg-white px-5 py-2">
                      <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                        {errors?.basic?.map((item, index) => (
                        <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  { errors?.project?.length > 0 &&  <div className="w-full text-base mt-2 font-semibold"> Project Details </div>}
                  <div className="w-full rounded-lg bg-white px-5 py-2">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors?.project?.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  { errors?.social?.length > 0 &&  <div className="w-full text-base mt-2 font-semibold"> Social </div>}
                  <div className="w-full rounded-lg bg-white px-5 py-2">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors?.social?.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  </>)
                 }
                 
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

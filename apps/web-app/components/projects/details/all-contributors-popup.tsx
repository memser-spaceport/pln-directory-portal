import { Dialog, Transition } from '@headlessui/react';
import { UserIcon, XCircleIcon } from '@heroicons/react/solid';
import { Fragment } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

export default function AllContributorsPopup({
  isOpen,
  onClose,
  contributorsList,
  contributingMembers,
}) {
  const contriTitle = 'Contributors';
  const router = useRouter();

  const getMemberDetailTemplate = (uid, name, url) => {
    return (
      <>
        <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-100" key={'contributor' + uid}
        onClick={()=>{
          router.push('/members/' + uid);
        }}
        >
          <div>
            {url && (
              <Image
                src={url}
                alt="member image"
                width={40}
                height={40}
                className="shrink-0 rounded-full border border-[#E2E8F0]"
              />
            )}
            {!url && (
              <UserIcon className="h-[40px] w-[40px] shrink-0 rounded-full bg-slate-100 fill-slate-200" />
            )}
          </div>
          <div className="text-base font-normal not-italic leading-5 text-black">
            {name}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed relative inset-0 left-0 top-0 z-[1000] w-full grow overflow-x-hidden outline-none"
          onClose={() => onClose}
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
                <Dialog.Panel className="slim-scroll relative h-[645px] w-full max-w-2xl transform rounded-md bg-white py-8 pl-8 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h2"
                    className="pb-3 text-base font-semibold not-italic leading-[22px]"
                  >
                    <div className="flex justify-between pr-7">
                      <div className="flex items-center gap-2">
                        <p className="">
                          {' '}
                          {contriTitle}({contributorsList.length+contributingMembers?.length})
                        </p>
                      </div>
                    </div>
                  </Dialog.Title>
                  <div className="h-[94%] overflow-y-scroll">
                    {contributorsList &&
                      contributorsList.map((contri, index) => {
                        return getMemberDetailTemplate(
                          contri?.uid,
                          contri?.name,
                          contri?.logo
                        );
                      })}
                    {contributingMembers &&
                      contributingMembers.map((contri) => {
                        return getMemberDetailTemplate(
                          contri.uid,
                          contri.name,
                          contri.image?.url
                        );
                      })}
                  </div>
                  <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-white" />
                  <XCircleIcon
                    onClick={() => {
                      onClose();
                    }}
                    data-testid={'close-icon'}
                    className={
                      'absolute -top-4 -right-4 h-8 w-8 cursor-pointer text-slate-600'
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
